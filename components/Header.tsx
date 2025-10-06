'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './Header.css';

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="main-header">
      <div className="header-container">
        <div className="logo">
          <Link href="/stocks">
            <span className="logo-text">Tilde News</span>
          </Link>
        </div>
        <nav className="nav-links">
          <Link 
            href="/stocks" 
            className={pathname === '/stocks' ? 'nav-link active' : 'nav-link'}
          >
            📈 Acciones
          </Link>
          <Link 
            href="/news" 
            className={pathname === '/news' ? 'nav-link active' : 'nav-link'}
          >
            📰 Noticias
          </Link>
        </nav>
      </div>
    </header>
  );
}
