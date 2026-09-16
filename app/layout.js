import './globals.css';

export const metadata = {
  title: 'GpEC Daily Report',
  description: 'Goalpara Electrical Circle daily report dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <a href="/" className="brand">GpEC Daily Report</a>
            <nav>
              <a href="/upload">Upload</a>
              <a href="/manual-inputs">Monthly Inputs</a>
            </nav>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
