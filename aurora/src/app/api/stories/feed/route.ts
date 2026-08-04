import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { buildStoryFeedForUsers, getContactUserIds } from '@/lib/story-api'
import { withJsonApi } from '@/lib/with-json-api'

export const GET = withJsonApi(async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const contactIds = await getContactUserIds(me.id)
  const users = await buildStoryFeedForUsers(contactIds, me.id)

  return NextResponse.json({ users })
})
