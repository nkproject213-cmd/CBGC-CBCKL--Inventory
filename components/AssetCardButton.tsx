"use client";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Download, X } from "lucide-react";
import type { InventoryItem, Organization } from "@/lib/types";
import { isPhotoUrl } from "@/lib/flexible-fields";
import type { CardPhoto } from "@/lib/asset-cards";

type Disk = { write(bytes: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> };
type Picker = Window & { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable(): Promise<Disk> }> };
const MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_PART=64*1024*1024;
async function cardPhoto(urlValue:string, signal:AbortSignal):Promise<CardPhoto> {
  const url=new URL(urlValue);
  if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw new Error("지원하지 않는 사진 주소");
  const response=await fetch(url.href,{mode:"cors",credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(!response.ok||!response.body)throw new Error(`사진 응답 오류 ${response.status}`);
  if(!response.headers.get("Content-Type")?.toLowerCase().startsWith("image/")){await response.body.cancel();throw new Error("이미지 응답이 아님");}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024)throw new Error("사진 20MB 초과");chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  signal.throwIfAborted();
  const blob=new Blob(chunks as BlobPart[],{type:response.headers.get("Content-Type")!.split(";")[0]});
  const bitmap=await createImageBitmap(blob);
  try{
    const {width,height}=bitmap;
    if(!width||!height||width*height>80000000)throw new Error("사진 해상도가 너무 크거나 잘못됨");
    if(["image/jpeg","image/png"].includes(blob.type)&&size<=2*1024*1024){
      return {bytes:new Uint8Array(await blob.arrayBuffer()),width,height,extension:blob.type==="image/png"?"png":"jpg"};
    }
    const scale=Math.min(1,1600/Math.max(width,height)),canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("사진 변환 실패");
    ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const converted=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
    if(!converted)throw new Error("엑셀용 사진 변환 실패");
    signal.throwIfAborted();
    return {bytes:new Uint8Array(await converted.arrayBuffer()),width:canvas.width,height:canvas.height,extension:"jpg"};
  }finally{bitmap.close();}
}
export default function AssetCardButton({org}:{org:Organization}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState<InventoryItem[]>([]);
  const [loading,setLoading]=useState(false),[running,setRunning]=useState(false);
  const [expired,setExpired]=useState(false),[message,setMessage]=useState("");
  const [progress,setProgress]=useState(0),[report,setReport]=useState("");
  const [part,setPart]=useState<{url:string;name:string}|null>(null);
  const controller=useRef<AbortController|null>(null),busy=useRef(false);
  const nextPart=useRef<(()=>void)|null>(null),partUrl=useRef<string|null>(null);
  const selected=expired?items.filter(item=>item.item_status==="내용연수 경과"):items;
  useEffect(()=>{
    if(!open)return;
    const abort=new AbortController();setLoading(true);setItems([]);setMessage("");setReport("");
    fetch(`/api/items?org=${org}`,{cache:"no-store",signal:abort.signal}).then(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error||"물품 조회 실패");
      if(!abort.signal.aborted)setItems((body.items as InventoryItem[]).sort((a,b)=>a.management_no.localeCompare(b.management_no,"ko",{numeric:true})));
    }).catch(error=>{if(!abort.signal.aborted)setMessage(error instanceof Error?error.message:"조회 실패");})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[open,org]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(busy.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",warn);
    return()=>{window.removeEventListener("beforeunload",warn);controller.current?.abort();nextPart.current?.();if(partUrl.current)URL.revokeObjectURL(partUrl.current);};
  },[]);
  function close(){if(busy.current){controller.current?.abort();nextPart.current?.();}else setOpen(false);}
  function download(url:string,name:string){const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();}
  function savePart(){if(!part)return;download(part.url,part.name);const url=part.url;setTimeout(()=>URL.revokeObjectURL(url),30000);partUrl.current=null;setPart(null);nextPart.current?.();}
  function saveReport(){const url=URL.createObjectURL(new Blob([report],{type:"text/plain;charset=utf-8"}));download(url,`${org}_자산관리카드_생성결과.txt`);setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function start(){
    if(busy.current||!selected.length)return;
    const snapshot=selected.map(item=>({...item}));busy.current=true;setRunning(true);setProgress(0);setReport("");setMessage("");
    const abort=new AbortController();controller.current=abort;
    let disk:Disk|null=null,contents:Uint8Array[]=[],partNumber=1,saved=0,photos=0,missing=0;
    const failures:string[]=[];const prefix=`${org}_자산관리카드_${new Date().toISOString().slice(0,10)}`;
    try{
      const picker=(window as Picker).showSaveFilePicker;
      if(picker){const handle=await picker.call(window,{suggestedName:`${prefix}.xlsx`,types:[{description:"Excel 자산관리카드",accept:{[MIME]:[".xlsx"]}}]});disk=await handle.createWritable();}
      const {AssetCardWorkbook,loadCardTemplate,validateCardItems}=await import("@/lib/asset-cards");
      validateCardItems(snapshot);const template=await loadCardTemplate();
      const make=()=>new AssetCardWorkbook(template,{write:async bytes=>{abort.signal.throwIfAborted();if(disk)await disk.write(bytes);else contents.push(bytes);}});
      let book=make();
      async function finishPart(last:boolean){
        await book.finish();
        if(!disk){
          const url=URL.createObjectURL(new Blob(contents as BlobPart[],{type:MIME}));contents=[];partUrl.current=url;
          setPart({url,name:`${prefix}${partNumber===1&&last?"":`_${String(partNumber).padStart(3,"0")}`}.xlsx`});
          setMessage(`${partNumber}번째 엑셀 준비 완료. 아래 저장 버튼을 누르면 ${last?"완료돼":"다음 물품을 계속 처리해"}.`);
          await new Promise<void>(resolve=>{nextPart.current=resolve;if(abort.signal.aborted)resolve();});nextPart.current=null;
          abort.signal.throwIfAborted();saved++;partNumber++;book=make();
        }
      }
      for(let index=0;index<snapshot.length;index++){
        abort.signal.throwIfAborted();const item=snapshot[index];let photo:CardPhoto|null=null;
        if(isPhotoUrl(item.photo_url)){try{photo=await cardPhoto(item.photo_url,abort.signal);}catch(error){abort.signal.throwIfAborted();failures.push(`${item.management_no}: ${error instanceof Error?error.message:"사진 처리 실패"}`);}}
        else missing++;
        if(!disk&&book.sheetCount&&(book.sheetCount>=100||book.bytesWritten+(photo?.bytes.length||0)>MAX_PART))await finishPart(false);
        await book.add(item,photo);if(photo)photos++;setProgress(index+1);
        setMessage(`${index+1}/${snapshot.length}개 카드 작성 · 사진 ${photos}개 · 사진 없음 ${missing}개 · 사진 실패 ${failures.length}개`);
        if(index%10===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      await finishPart(true);if(disk){await disk.close();disk=null;saved=1;}
      const summary=`완료: 물품 ${snapshot.length}개, 엑셀 ${saved}개. 사진 ${photos}개 / 미등록 ${missing}개 / 불러오기 실패 ${failures.length}개. 사진 없는 칸은 공백이야.`;
      setMessage(summary);setReport(`${summary}\n\n${failures.length?"사진 불러오기 실패(해당 카드의 사진칸은 공백):\n"+failures.join("\n"):"사진 오류 없음"}\n\n원본 양식의 일렬번호와 수리이력은 사이트에 데이터가 없어 공백으로 두었습니다.\n감가상각은 첨부 양식의 구매단가 / 내용년수 계산을 사용합니다. 내용연수에 맞춰 감가상각 행 수와 높이를 조정하며, 원본의 같은 영역 안에 모든 연도를 표시합니다. 다음 페이지로 넘기지 않습니다.\n`);
    }catch(error){
      if(disk)await disk.abort().catch(()=>{});
      setMessage(abort.signal.aborted||(error instanceof DOMException&&error.name==="AbortError")?`취소했어. 이미 저장한 파일 ${saved}개는 남아 있어.`:`생성 중단: ${error instanceof Error?error.message:"파일 저장 실패"}`);
    }finally{if(partUrl.current)URL.revokeObjectURL(partUrl.current);partUrl.current=null;nextPart.current=null;setPart(null);busy.current=false;setRunning(false);controller.current=null;}
  }
  return <>
    <button className="btn" onClick={()=>setOpen(true)}><FileSpreadsheet size={15}/> 자산관리카드 생성</button>
    {open&&<div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="자산관리카드 생성" style={{maxWidth:660}}>
      <div className="modal-head"><strong>{org} 자산관리카드 생성</strong><button className="btn small" onClick={close}><X size={14}/>{running?"취소":"닫기"}</button></div>
      <div className="modal-body">
        <p>첨부한 <strong>자산관리카드 양식.xlsx</strong>의 표·병합·색상·열 너비를 유지해서 물품마다 시트를 만들어.</p>
        <p style={{fontSize:13}}>관리번호 <strong>CBGC-001 → 시트명·문서번호 CB-1</strong>. 사진은 원본 사진칸에 비율을 유지해 넣고, 등록된 사진이 없으면 공백으로 남겨.</p>
        <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={expired} disabled={running} onChange={e=>setExpired(e.target.checked)}/> 내용연수 경과 물품만 생성</label>
        <p style={{fontSize:12,color:"var(--muted)"}}>대상은 현재 {org} 대장 전체야. 목록 화면의 검색·체크박스 선택과는 별개이며, 위 옵션으로 경과 물품만 고를 수 있어.</p>
        <p style={{fontSize:12,color:"var(--muted)"}}>일렬번호·수리이력은 공백. 감가상각은 원본 수식 기준이며, 감가상각 구역의 전체 높이는 그대로 두고 내용연수에 맞춰 행 수·셀 높이를 조정해. 카드 1개는 A4 1페이지야. 취득원가나 내용연수가 없으면 해당 계산칸은 공백으로 둬. 내용연수가 길수록 해당 구역의 글자가 작아질 수 있어.</p>
        <p style={{fontSize:12,color:"var(--muted)"}}>직접 파일 저장이 지원되면 엑셀 하나로 저장해. 미지원 브라우저는 최대 100개 시트 또는 약 64MB마다 나눠 저장하므로 각 파일의 저장 버튼을 눌러줘. 완료 전 페이지를 닫지 마.</p>
        {loading?<p>물품 불러오는 중...</p>:<p><strong>대상 {selected.length}개</strong> / 사진 등록 {selected.filter(i=>isPhotoUrl(i.photo_url)).length}개</p>}
        {running&&<progress max={selected.length||1} value={progress} style={{width:"100%"}}/>}
        <p role="status" style={{fontSize:13,whiteSpace:"pre-wrap"}}>{message}</p>
        {part&&<button className="btn primary" onClick={savePart}><Download size={15}/> 이 엑셀 저장 후 계속</button>}
        {!!report&&<button className="btn" onClick={saveReport}>생성 결과·사진 오류 내역 저장</button>}
      </div>
      <div className="modal-foot"><button className="btn" onClick={close}>{running?"생성 취소":"닫기"}</button><button className="btn primary" disabled={running||loading||!selected.length} onClick={start}><FileSpreadsheet size={15}/>{running?"작성 중...":"자산관리카드 엑셀 만들기"}</button></div>
    </div></div>}
  </>;
}
