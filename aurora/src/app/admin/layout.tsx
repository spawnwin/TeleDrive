import type { Metadata } from 'next'
import { requireAdminPage } from '@/lib/auth'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export const metadata: Metadata = {
  title: 'Aurora Admin',
  description: 'Панель администратора Aurora',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage()

  return (
    <div className="admin-panel flex min-h-screen text-zinc-100">
      <AdminSidebar adminName={admin.name} />
      <main className="relative min-w-0 flex-1 overflow-auto">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-sky-500/[0.06] to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 pt-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] pb-10 lg:px-8 lg:pt-[max(2.25rem,calc(env(safe-area-inset-top)+2.25rem))]">
          {children}
        </div>
      </main>
    </div>
  )
}
