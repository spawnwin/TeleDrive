import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { withJsonApi } from '@/lib/with-json-api'
import { spendCoins, refundCoins } from '@/lib/coins-server'
import { isPremiumActive } from '@/lib/coins'
import {
  DEFAULT_LIMITED_SUPPLY,
  GIFT_COIN_REASONS,
  serializeGiftMetadata,
} from '@/lib/gifts'
import { areUsersBlocked } from '@/lib/user-blocks'

export const POST = withJsonApi(async function POST(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await req.json()
  const { giftId, recipientId, chatId, note, isPrivate } = body ?? {}

  if (!giftId || !recipientId) {
    return NextResponse.json({ error: 'Укажите подарок и получателя' }, { status: 400 })
  }
  if (recipientId === me.id) {
    return NextResponse.json({ error: 'Нельзя отправить подарок себе' }, { status: 400 })
  }

  const gift = await db.giftCatalogItem.findFirst({ where: { id: giftId, active: true } })
  if (!gift) return NextResponse.json({ error: 'Подарок не найден' }, { status: 404 })

  if (gift.isPremium && !isPremiumActive(me)) {
    return NextResponse.json({ error: 'Этот подарок доступен только с Premium' }, { status: 403 })
  }

  const recipient = await db.user.findUnique({
    where: { id: recipientId },
    select: { id: true, isBanned: true },
  })
  if (!recipient || recipient.isBanned) {
    return NextResponse.json({ error: 'Получатель недоступен' }, { status: 404 })
  }
  if (await areUsersBlocked(me.id, recipientId)) {
    return NextResponse.json({ error: 'Пользователь заблокирован' }, { status: 403 })
  }

  let targetChatId: string | null = chatId || null
  if (targetChatId) {
    const membership = await db.chatMember.findUnique({
      where: { userId_chatId: { userId: me.id, chatId: targetChatId } },
    })
    const recipientMembership = await db.chatMember.findUnique({
      where: { userId_chatId: { userId: recipientId, chatId: targetChatId } },
    })
    if (!membership || !recipientMembership) {
      return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
    }
  } else {
    const existingPrivate = await db.chat.findFirst({
      where: {
        type: 'private',
        AND: [
          { members: { some: { userId: me.id } } },
          { members: { some: { userId: recipientId } } },
        ],
      },
      select: { id: true },
    })
    if (existingPrivate) {
      targetChatId = existingPrivate.id
    } else {
      const colors = ['#7c3aed', '#06b6d4', '#ec4899']
      const chat = await db.chat.create({
        data: {
          type: 'private',
          avatarColor: colors[Math.floor(Math.random() * colors.length)],
          members: {
            create: [
              { userId: me.id, role: 'owner' },
              { userId: recipientId, role: 'member' },
            ],
          },
        },
      })
      targetChatId = chat.id
    }
  }

  const spend = await spendCoins(me.id, gift.starPrice, GIFT_COIN_REASONS.SEND, {
    giftId: gift.id,
    recipientId,
  })
  if (!spend.ok) {
    return NextResponse.json({ error: spend.error || 'Недостаточно Stars' }, { status: 402 })
  }

  try {
    const giftSent = await db.$transaction(async (tx) => {
      let serialNumber: number | null = null

      if (gift.isLimited) {
        const locked = await tx.giftCatalogItem.findUnique({ where: { id: gift.id } })
        if (!locked) throw new Error('gift_missing')
        const supply = locked.totalSupply ?? DEFAULT_LIMITED_SUPPLY
        if (locked.issuedCount >= supply) {
          throw Object.assign(new Error('sold_out'), { code: 'SOLD_OUT' })
        }
        serialNumber = locked.issuedCount + 1
        await tx.giftCatalogItem.update({
          where: { id: gift.id },
          data: { issuedCount: { increment: 1 }, totalSupply: supply },
        })
      }

      return tx.giftSent.create({
        data: {
          giftId: gift.id,
          senderId: me.id,
          recipientId,
          chatId: targetChatId,
          starsSpent: gift.starPrice,
          serialNumber,
          isPrivate: !!isPrivate,
          note: note?.trim()?.slice(0, 200) || null,
        },
      })
    })

    const metadata = serializeGiftMetadata({
      giftId: gift.id,
      giftSentId: giftSent.id,
      giftTitle: gift.title,
      giftThumbnailUrl: gift.thumbnailUrl,
      giftStickerUrl: gift.stickerUrl,
      giftAnimationUrl: gift.animationUrl,
      starsSpent: gift.starPrice,
      isPrivate: !!isPrivate,
      note: note?.trim() || null,
      isLimited: gift.isLimited,
      serialNumber: giftSent.serialNumber,
      totalSupply: gift.isLimited ? gift.totalSupply ?? DEFAULT_LIMITED_SUPPLY : null,
    })

    const content = note?.trim() || `🎁 ${gift.title}`

    const message = await db.message.create({
      data: {
        chatId: targetChatId!,
        senderId: me.id,
        content,
        type: 'gift',
        metadata,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarColor: true,
            avatarUrl: true,
            publicKey: true,
          },
        },
        reactions: { include: { user: { select: { id: true, name: true } } } },
      },
    })

    await db.giftSent.update({
      where: { id: giftSent.id },
      data: { messageId: message.id },
    })

    await db.chat.update({ where: { id: targetChatId! }, data: { updatedAt: new Date() } })

    const { sendPushToOfflineChatMembers } = await import('@/lib/push-server')
    sendPushToOfflineChatMembers(targetChatId!, me.id, {
      title: me.name,
      body: giftSent.serialNumber
        ? `🎁 ${gift.title} #${String(giftSent.serialNumber).padStart(3, '0')}`
        : `🎁 ${gift.title}`,
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      balance: spend.balance,
      giftSent: {
        id: giftSent.id,
        serialNumber: giftSent.serialNumber,
      },
      message: {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        sender: message.sender,
        content: message.content,
        type: message.type,
        metadata: message.metadata,
        createdAt: message.createdAt,
        reactions: [],
      },
      chatId: targetChatId,
    })
  } catch (err) {
    await refundCoins(me.id, gift.starPrice, 'gift_refund', { giftId: gift.id, recipientId }).catch(
      () => {},
    )
    if ((err as { code?: string })?.code === 'SOLD_OUT' || (err as Error)?.message === 'sold_out') {
      return NextResponse.json({ error: 'Лимитированный подарок распродан' }, { status: 409 })
    }
    throw err
  }
})
