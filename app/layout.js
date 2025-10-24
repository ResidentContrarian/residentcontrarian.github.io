// app/layout.js
export const metadata = {
  title: 'RC Site',
  description: 'Minimal App Router demo',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
