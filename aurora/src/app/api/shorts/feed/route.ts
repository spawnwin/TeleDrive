import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPremiumActive } from '@/lib/coins'
import { getFriendshipView } from '@/lib/friends'
import { withJsonApi } from '@/lib/with-json-api'
import { areUsersBlocked } from '@/lib/user-blocks'

export const GET = withJsonApi(async function GET(req: NextRequest) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const userIsPremium = isPremiumActive(me)

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const take = Number(url.searchParams.get('take') ?? 12)
  const segment = url.searchParams.get('segment') === 'subscriptions' ? 'subscriptions' : 'foryou'

  const subscribedCreatorIds =
    segment === 'subscriptions'
      ? (
          await db.shortSubscription.findMany({
            where: { subscriberId: me.id },
            select: { creatorId: true },
          })
        ).map((s) => s.creatorId)
      : []

  const shortsRaw = await db.short.findMany({
    where: {
      isHidden: false,
      OR: [
        { reviewStatus: 'approved' },
        { creatorId: me.id, reviewStatus: 'pending' },
      ],
      ...(segment === 'subscriptions' && subscribedCreatorIds.length > 0
        ? { creatorId: { in: subscribedCreatorIds } }
        : segment === 'subscriptions'
          ? { id: '___none___' }
          : {}),
    },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(40, Math.max(take * 2, take)),
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      creator: {
        select: { id: true, name: true, username: true, avatarColor: true },
      },
      parentShort: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          videoUrl: true,
          creator: { select: { id: true, name: true, username: true, avatarColor: true } },
        },
      },
      shortLikes: {
        where: { userId: me.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  const blockedCreators = new Set<string>()
  for (const sid of [...new Set(shortsRaw.map((s) => s.creatorId))]) {
    if (sid !== me.id && (await areUsersBlocked(me.id, sid))) blockedCreators.add(sid)
  }
  const shorts = shortsRaw.filter((s) => !blockedCreators.has(s.creatorId)).slice(0, take)

  const creatorIds = [...new Set(shorts.map((s) => s.creatorId))]
  const friendships =
    creatorIds.length > 0
      ? await db.friendship.findMany({
          where: {
            OR: [
              { requesterId: me.id, addresseeId: { in: creatorIds } },
              { addresseeId: me.id, requesterId: { in: creatorIds } },
            ],
          },
        })
      : []

  const friendshipByCreator = new Map<string, ReturnType<typeof getFriendshipView>>()
  for (const f of friendships) {
    const creatorId = f.requesterId === me.id ? f.addresseeId : f.requesterId
    friendshipByCreator.set(creatorId, getFriendshipView(f, me.id))
  }

  const ads = await db.adCampaign.findMany({
    where: { active: true },
    take: 5,
    orderBy: { createdAt: 'desc' },
  }).catch(() => [])

  const activeAds = (ads as any[]).filter((a) => a.budget > 0 && a.spent < a.budget)

  type FeedItem =
    | { type: 'short'; data: any }
    | { type: 'ad'; data: any }

  const items: FeedItem[] = []
  let adIdx = 0
  for (let i = 0; i < shorts.length; i++) {
    const s = shorts[i]
    const tagsRaw = s.tags
    items.push({
      type: 'short',
      data: {
        id: s.id,
        title: s.title,
        description: s.description,
        videoUrl: s.videoUrl,
        thumbnailUrl: s.thumbnailUrl,
        source: s.source,
        externalId: s.externalId,
        duration: s.duration,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        earnings: s.earnings,
        tags: tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [],
        createdAt: s.createdAt,
        creator: {
          ...s.creator,
          friendship: friendshipByCreator.get(s.creatorId) ?? {
            id: null,
            status: 'none',
          },
        },
        isLiked: s.shortLikes.length > 0,
        parentShortId: s.parentShortId ?? null,
        duetMode: s.duetMode ?? null,
        challengeTitle: s.challengeTitle ?? null,
        parentShort: s.parentShort
          ? {
              id: s.parentShort.id,
              title: s.parentShort.title,
              thumbnailUrl: s.parentShort.thumbnailUrl,
              videoUrl: s.parentShort.videoUrl,
              creator: s.parentShort.creator,
            }
          : null,
      },
    })
    if (
      segment === 'foryou' &&
      !userIsPremium &&
      (i + 1) % 4 === 0 &&
      i !== shorts.length - 1 &&
      activeAds.length > 0
    ) {
      const ad = activeAds[adIdx % activeAds.length]
      adIdx++
      items.push({
        type: 'ad',
        data: {
          id: ad.id,
          title: ad.title,
          description: ad.description,
          imageUrl: ad.imageUrl,
          targetUrl: ad.targetUrl,
          cpm: ad.cpm,
          impressions: ad.impressions,
          clicks: ad.clicks,
        },
      })
    }
  }

  const nextCursor = shorts.length === take ? shorts[shorts.length - 1]?.id : null

  return NextResponse.json({
    items,
    nextCursor,
  })
})
