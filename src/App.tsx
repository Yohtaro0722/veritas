import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import MapPage from './pages/MapPage';
import BuildingDetailPage from './pages/BuildingDetailPage';
import TenantDetailPage from './pages/TenantDetailPage';
import TodayPage from './pages/TodayPage';
import PrepPage from './pages/PrepPage';

// 2モード設計（§3）。タブで地図/今日攻める先/準備モードを切替。
export default function App() {
  const location = useLocation();
  // 詳細画面（ビル/テナント）ではタブを隠して没入させる
  const hideTab = location.pathname.startsWith('/building/') || location.pathname.startsWith('/tenant/');

  return (
    <div className="app">
      <div className="app-main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/prep" element={<PrepPage />} />
          <Route path="/building/:id" element={<BuildingDetailPage />} />
          <Route path="/tenant/:id" element={<TenantDetailPage />} />
        </Routes>
      </div>

      {!hideTab && (
        <nav className="tabbar">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">🗺️</span>
            地図
          </NavLink>
          <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">🎯</span>
            今日攻める
          </NavLink>
          <NavLink to="/prep" className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">⚙️</span>
            準備モード
          </NavLink>
        </nav>
      )}
    </div>
  );
}
