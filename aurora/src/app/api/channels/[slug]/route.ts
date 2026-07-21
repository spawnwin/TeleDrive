import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { normalizeChannelSlug, getChannelSubscriberCount, isUserBanned } from '@/lib/channels'
import { withJsonApi } from '@/lib/with-json-api'

const PUBLIC_TYPES = ['channel', 'group'] as const

export const GET = withJsonApi(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const normalized = normalizeChannelSlug(slug)

  const chat = await db.chat.findFirst({
    where: { type: { in: [...PUBLIC_TYPES] }, slug: normalized },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, username: true, avatarColor: true } } },
      },
    },
  })
  if (!chat) {
    return NextResponse.json({ error: 'Канал или группа не найдены' }, { status: 404 })
  }

  const subscriberCount =
    chat.type === 'channel'
      ? await getChannelSubscriberCount(chat.id)
      : chat.members.length
  const me = await getCurrentUser()
  const isSubscribed = me ? chat.members.some((m) => m.userId === me.id) : false

  return NextResponse.json({
    channel: {
      id: chat.id,
      type: chat.type,
      title: chat.title,
      description: chat.description,
      slug: chat.slug,
      avatarColor: chat.avatarColor,
      avatarUrl: chat.avatarUrl,
      subscriberCount,
      isSubscribed,
    },
  })
})

export const POST = withJsonApi(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { slug } = await params
  const normalized = normalizeChannelSlug(slug)
  const body = await req.json()
  const action = body?.action || 'subscribe'

  const chat = await db.chat.findFirst({
    where: { type: { in: [...PUBLIC_TYPES] }, slug: normalized },
  })
  if (!chat) {
    return NextResponse.json({ error: 'Канал или группа не найдены' }, { status: 404 })
  }

  if (action === 'unsubscribe') {
    await db.chatMember.deleteMany({
      where: { chatId: chat.id, userId: me.id, role: { not: 'owner' } },
    })
    return NextResponse.json({ ok: true, subscribed: false })
  }

  if (await isUserBanned(chat.id, me.id)) {
    return NextResponse.json(
      { error: chat.type === 'group' ? 'Вы заблокированы в этой группе' : 'Вы заблокированы в этом канале' },
      { status: 403 },
    )
  }

  const existing = await db.chatMember.findUnique({
    where: { userId_chatId: { userId: me.id, chatId: chat.id } },
  })
  if (!existing) {
    await db.chatMember.create({
      data: {
        userId: me.id,
        chatId: chat.id,
        role: chat.type === 'channel' ? 'subscriber' : 'member',
      },
    })
  }

  const subscriberCount =
    chat.type === 'channel'
      ? await getChannelSubscriberCount(chat.id)
      : await db.chatMember.count({ where: { chatId: chat.id } })

  return NextResponse.json({
    ok: true,
    subscribed: true,
    chatId: chat.id,
    type: chat.type,
    subscriberCount,
  })
})
