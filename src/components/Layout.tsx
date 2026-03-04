import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, FolderKanban, CalendarDays, FileJson, Settings } from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "总览" },
  { to: "/projects",  icon: FolderKanban,    label: "项目" },
  { to: "/schedule",  icon: CalendarDays,    label: "周计划" },
  { to: "/import",    icon: FileJson,        label: "导入" },
  { to: "/settings",  icon: Settings,        label: "设置" },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* 侧边栏 */}
      <aside className="w-52 bg-gray-900 flex flex-col py-6 px-3 gap-1 border-r border-gray-800">
        <div className="text-xl font-bold text-white px-3 mb-6">CourseFlow</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}