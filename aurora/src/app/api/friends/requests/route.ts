import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const count = await db.friendship.count({
    where: {
      addresseeId: me.id,
      status: 'pending',
    },
  })

  return NextResponse.json({ count })
})
