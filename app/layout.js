import './globals.css';

export const metadata = {
  title: 'Goalpara Circle Reporting System',
  description: 'Goalpara Electrical Circle daily report dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <a href="/" className="brand">Goalpara Circle Reporting System</a>
            <nav>
              <a href="/upload">Upload</a>
              <a href="/manual-inputs">Monthly Inputs</a>
              <a href="/consumer-indexing">Consumer Indexing</a>
              <a href="/prepaid-recovery">Prepaid Reports</a>
              <a href="/overall-ce">Overall CE</a>
              <a href="/meter-cost">Meter Cost</a>
              <a href="/hq-mrr">HQ MRR</a>
            </nav>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
