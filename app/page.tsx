import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landing-card">
        <h1 className="landing-title">CBGC · CBCKL 물품관리 시스템</h1>
        <p className="landing-sub">
          물품에 부착된 QR코드를 스캔하면 해당 물품의 공개 정보를 확인할 수 있습니다.
          관리자는 로그인 후 CBGC와 CBCKL 물품대장을 독립적으로 관리합니다.
        </p>
        <div className="brand-row">
          <div className="brand-card cbgc">
            <h2>CBGC</h2>
            <p>충북글로벌게임센터 물품대장</p>
          </div>
          <div className="brand-card cbckl">
            <h2>CBCKL</h2>
            <p>CBCKL 물품대장</p>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <Link className="btn primary" href="/admin/login">관리자 로그인</Link>
        </div>
      </section>
    </main>
  );
}
