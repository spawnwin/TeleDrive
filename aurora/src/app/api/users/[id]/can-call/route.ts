import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { assertCanCall } from '@/lib/privacy-server'
import { withJsonApi } from '@/lib/with-json-api'

/** Preflight: can the current user call this user? */
export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const gate = await assertCanCall(me.id, id)
  if (!gate.ok) {
    return NextResponse.json({ ok: false, canCall: false, error: gate.error }, { status: gate.status })
  }
  return NextResponse.json({ ok: true, canCall: true })
})
