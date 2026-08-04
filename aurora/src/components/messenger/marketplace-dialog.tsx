'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Store,
  Search,
  Plus,
  Loader2,
  Package,
  Flag,
  ArrowLeft,
  ImagePlus,
  X,
  Receipt,
  Pencil,
  Trash2,
  ListOrdered,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store'
import { useI18n } from '@/hooks/use-i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { uploadFileWithRetry } from '@/lib/upload-client'
import { Avatar } from './avatar'
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CATEGORY_LABELS_RU,
  MAX_LISTING_IMAGES,
} from '@/lib/marketplace'

interface Listing {
  id: string
  title: string
  description: string | null
  priceCoins: number
  category: string
  images: string[]
  isDigital: boolean
  status: string
  views: number
  createdAt: string
  seller: { id: string; name: string; username: string; avatarColor: string; avatarUrl: string | null }
  order?: { buyer: { name: string; username: string }; seller: { name: string; username: string }; createdAt: string } | null
}

type View = 'browse' | 'create' | 'detail' | 'orders' | 'mine'

interface MarketplaceDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function MarketplaceDialog({ open, onOpenChange }: MarketplaceDialogProps) {
  const { t } = useI18n()
  const { currentUser, setCurrentUser } = useAppStore()
  const [view, setView] = useState<View>('browse')
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [selected, setSelected] = useState<Listing | null>(null)
  const [buying, setBuying] = useState(false)
  const [mine, setMine] = useState<Listing[]>([])
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Create form
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formCategory, setFormCategory] = useState<string>('other')
  const [formDigital, setFormDigital] = useState(false)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [formImages, setFormImages] = useState<string[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Orders
  const [orders, setOrders] = useState<{
    purchases: Array<{ id: string; priceCoins: number; createdAt: string; listing: { id: string; title: string }; seller: { name: string; username: string } }>
    sales: Array<{ id: string; priceCoins: number; createdAt: string; listing: { id: string; title: string }; buyer: { name: string; username: string } }>
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (category !== 'all') params.set('category', category)
      const res = await fetch(`/api/marketplace?${params}`)
      const data = await res.json()
      setListings(data.listings || [])
    } finally {
      setLoading(false)
    }
  }, [search, category])

  useEffect(() => {
    if (open && view === 'browse') load()
  }, [open, view, load])

  // Open a listing from a feed share card.
  useEffect(() => {
    const handler = async (e: Event) => {
      const listingId = (e as CustomEvent<{ listingId?: string }>).detail?.listingId
      if (!listingId) return
      try {
        const res = await fetch(`/api/marketplace/${encodeURIComponent(listingId)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.listing) {
          setSelected({
            ...(data.listing as Listing),
            order: data.order ?? (data.listing as Listing).order ?? null,
          })
          setView('detail')
          setEditing(false)
          return
        }
        setSelected(null)
        setView('browse')
        toast.error(data.error || t('marketplace.notFound'))
      } catch {
        setSelected(null)
        setView('browse')
        toast.error(t('misc.error'))
      }
    }
    window.addEventListener('aurora:open-marketplace', handler)
    return () => window.removeEventListener('aurora:open-marketplace', handler)
  }, [t])

  const resetForm = () => {
    setFormTitle('')
    setFormDescription('')
    setFormPrice('')
    setFormCategory('other')
    setFormDigital(false)
    setShareToFeed(true)
    setFormImages([])
  }

  const uploadImage = async (file: File) => {
    setUploadingImage(true)
    try {
      const data = await uploadFileWithRetry(file, t)
      setFormImages((prev) => [...prev, data.url].slice(0, MAX_LISTING_IMAGES))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setUploadingImage(false)
    }
  }

  const publish = async () => {
    if (!formTitle.trim()) {
      toast.error(t('marketplace.errorTitle'))
      return
    }
    const price = Math.round(Number(formPrice))
    if (!price || price <= 0) {
      toast.error(t('marketplace.errorPrice'))
      return
    }
    setPublishing(true)
    try {
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          priceCoins: price,
          category: formCategory,
          images: formImages,
          isDigital: formDigital,
          shareToFeed,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('marketplace.published'))
      if (shareToFeed && data.sharedToFeed === false) {
        toast.error(t('feed.shareFailed'))
      }
      resetForm()
      setView('browse')
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setPublishing(false)
    }
  }

  const openDetail = async (listing: Listing) => {
    setSelected(listing)
    setView('detail')
    try {
      const res = await fetch(`/api/marketplace/${listing.id}`)
      const data = await res.json()
      if (res.ok) setSelected({ ...data.listing, order: data.order })
    } catch {}
  }

  const buy = async () => {
    if (!selected) return
    setBuying(true)
    try {
      const res = await fetch(`/api/marketplace/${selected.id}/buy`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('marketplace.purchased'))
      if (currentUser) setCurrentUser({ ...currentUser, coins: data.coins })
      setSelected((s) => (s ? { ...s, status: 'sold' } : s))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setBuying(false)
    }
  }

  const report = async () => {
    if (!selected) return
    const reason = window.prompt(t('marketplace.reportPrompt'))
    if (!reason?.trim()) return
    try {
      const res = await fetch(`/api/marketplace/${selected.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      toast.success(t('marketplace.reported'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    }
  }

  const loadOrders = async () => {
    setView('orders')
    const res = await fetch('/api/marketplace/orders')
    const data = await res.json()
    if (res.ok) setOrders(data)
  }

  const loadMine = async () => {
    setView('mine')
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace?mine=1')
      const data = await res.json()
      if (res.ok) setMine(data.listings || [])
    } finally {
      setLoading(false)
    }
  }

  const startEdit = () => {
    if (!selected) return
    setFormTitle(selected.title)
    setFormDescription(selected.description || '')
    setFormPrice(String(selected.priceCoins))
    setFormCategory(selected.category)
    setFormDigital(selected.isDigital)
    setFormImages(selected.images)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!selected) return
    if (!formTitle.trim()) {
      toast.error(t('marketplace.errorTitle'))
      return
    }
    const price = Math.round(Number(formPrice))
    if (!price || price <= 0) {
      toast.error(t('marketplace.errorPrice'))
      return
    }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/marketplace/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          priceCoins: price,
          category: formCategory,
          images: formImages,
          isDigital: formDigital,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setSelected((s) => (s ? { ...s, ...data.listing } : s))
      setMine((prev) => prev.map((l) => (l.id === data.listing.id ? { ...l, ...data.listing } : l)))
      toast.success(t('marketplace.saved'))
      setEditing(false)
      resetForm()
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteListing = async () => {
    if (!selected) return
    if (!window.confirm(t('marketplace.deleteConfirm'))) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/marketplace/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('misc.error'))
      setSelected((s) => (s ? { ...s, status: 'removed' } : s))
      setMine((prev) => prev.map((l) => (l.id === selected.id ? { ...l, status: 'removed' } : l)))
      toast.success(t('marketplace.deleted'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('misc.error'))
    } finally {
      setDeleting(false)
    }
  }

  const coins = currentUser?.coins ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            {view !== 'browse' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1.5"
                onClick={() => {
                  setSelected(null)
                  setEditing(false)
                  setView('browse')
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Store className="h-5 w-5 text-emerald-500" />
            <span className="flex-1">
              {view === 'create'
                ? t('marketplace.create')
                : view === 'detail'
                  ? t('marketplace.listing')
                  : view === 'orders'
                    ? t('marketplace.orders')
                    : view === 'mine'
                      ? t('marketplace.myListings')
                      : t('marketplace.title')}
            </span>
            {view === 'detail' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={loadOrders}
                title={t('marketplace.orders')}
              >
                <Receipt className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {view === 'browse' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[160px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('marketplace.searchPlaceholder')}
                    className="pl-8"
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('marketplace.allCategories')}</SelectItem>
                    {MARKETPLACE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {MARKETPLACE_CATEGORY_LABELS_RU[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={loadMine} title={t('marketplace.myListings')}>
                  <ListOrdered className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={loadOrders} title={t('marketplace.orders')}>
                  <Receipt className="h-4 w-4" />
                </Button>
                <Button
                  className="bg-gradient-to-r from-emerald-500 to-cyan-400 text-white"
                  onClick={() => setView('create')}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('marketplace.sell')}
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
              ) : listings.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{t('marketplace.empty')}</p>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {listings.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => openDetail(l)}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md"
                    >
                      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/50">
                        {l.images[0] ? (
                          <img src={l.images[0]} alt={l.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <Package className="h-10 w-10 text-muted-foreground/40" />
                        )}
                        <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-amber-400 backdrop-blur-sm">
                          {l.priceCoins}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-2 text-sm font-medium leading-tight">{l.title}</p>
                        <p className="mt-1.5 truncate text-xs text-muted-foreground">@{l.seller.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'mine' && (
            <>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
              ) : mine.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{t('marketplace.noMine')}</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {mine.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => openDetail(l)}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md"
                    >
                      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-muted/50">
                        {l.images[0] ? (
                          <img src={l.images[0]} alt={l.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <Package className="h-10 w-10 text-muted-foreground/40" />
                        )}
                        <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-amber-400 backdrop-blur-sm">
                          {l.priceCoins}
                        </span>
                        {l.status !== 'active' && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white backdrop-blur-sm">
                            {l.status === 'sold' ? t('marketplace.statusSold') : t('marketplace.statusRemoved')}
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="line-clamp-2 text-sm font-medium leading-tight">{l.title}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'create' && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">{t('marketplace.imagesLabel')}</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {formImages.map((url) => (
                    <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setFormImages((prev) => prev.filter((u) => u !== url))}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {formImages.length < MAX_LISTING_IMAGES && (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-muted/50">
                      {uploadingImage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-5 w-5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImage}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) uploadImage(f)
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">{t('marketplace.titleLabel')}</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} maxLength={100} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t('marketplace.descriptionLabel')}</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-1 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('marketplace.priceLabel')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="₽"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('marketplace.categoryLabel')}</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETPLACE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {MARKETPLACE_CATEGORY_LABELS_RU[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">{t('marketplace.digitalLabel')}</span>
                <Switch checked={formDigital} onCheckedChange={setFormDigital} />
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
                <Checkbox
                  checked={shareToFeed}
                  onCheckedChange={(v) => setShareToFeed(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{t('feed.shareToFeed')}</p>
                  <p className="text-xs text-muted-foreground">{t('feed.shareToFeedHint')}</p>
                </div>
              </label>
              <Button
                onClick={publish}
                disabled={publishing}
                className="w-full bg-gradient-to-r from-emerald-500 to-cyan-400 text-white"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('marketplace.publish')}
              </Button>
            </div>
          )}

          {view === 'detail' && selected && editing && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">{t('marketplace.imagesLabel')}</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {formImages.map((url) => (
                    <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setFormImages((prev) => prev.filter((u) => u !== url))}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {formImages.length < MAX_LISTING_IMAGES && (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-muted/50">
                      {uploadingImage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-5 w-5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingImage}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) uploadImage(f)
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">{t('marketplace.titleLabel')}</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} maxLength={100} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">{t('marketplace.descriptionLabel')}</Label>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="mt-1 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('marketplace.priceLabel')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="₽"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('marketplace.categoryLabel')}</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETPLACE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {MARKETPLACE_CATEGORY_LABELS_RU[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">{t('marketplace.digitalLabel')}</span>
                <Switch checked={formDigital} onCheckedChange={setFormDigital} />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={savingEdit}
                  onClick={() => {
                    setEditing(false)
                    resetForm()
                  }}
                >
                  {t('misc.cancel')}
                </Button>
                <Button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-400 text-white"
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : t('misc.save')}
                </Button>
              </div>
            </div>
          )}

          {view === 'detail' && selected && !editing && (
            <div className="space-y-4">
              {selected.images.length > 0 && (
                <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {selected.images.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt={selected.title}
                      className="h-48 w-48 shrink-0 snap-start rounded-xl object-cover shadow-sm"
                    />
                  ))}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold leading-tight">{selected.title}</h3>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-lg font-bold text-amber-500 dark:bg-amber-500/15">
                    {selected.priceCoins}
                  </span>
                  {selected.status !== 'active' && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {selected.status === 'sold' ? t('marketplace.statusSold') : t('marketplace.statusRemoved')}
                    </span>
                  )}
                </div>
              </div>

              {selected.order && (
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('marketplace.orderInfo')}
                  </p>
                  {selected.seller.id === currentUser?.id && (
                    <p>
                      {t('marketplace.orderBuyer')} @{selected.order.buyer.username}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.order.createdAt).toLocaleString()}
                  </p>
                </div>
              )}
              {selected.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
              )}
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <Avatar
                  name={selected.seller.name}
                  color={selected.seller.avatarColor}
                  imageUrl={selected.seller.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selected.seller.name}</p>
                  <p className="truncate text-xs text-muted-foreground">@{selected.seller.username}</p>
                </div>
              </div>
              {selected.seller.id !== currentUser?.id ? (
                <div className="space-y-2">
                  <Button
                    onClick={buy}
                    disabled={buying || selected.status !== 'active' || coins < selected.priceCoins}
                    className="w-full bg-gradient-to-r from-emerald-500 to-cyan-400 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30"
                    size="lg"
                  >
                    {buying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : coins < selected.priceCoins ? (
                      t('marketplace.notEnoughCoins')
                    ) : (
                      t('marketplace.buy')
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={report} className="w-full text-muted-foreground">
                    <Flag className="mr-1.5 h-3.5 w-3.5" />
                    {t('marketplace.report')}
                  </Button>
                </div>
              ) : selected.status === 'active' ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={startEdit}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {t('marketplace.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-500 hover:text-red-500"
                    onClick={deleteListing}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t('marketplace.delete')}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">{t('marketplace.ownListing')}</p>
              )}
            </div>
          )}

          {view === 'orders' && (
            <div className="space-y-5">
              {!orders ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">{t('marketplace.myPurchases')}</h4>
                    {orders.purchases.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">{t('marketplace.noOrders')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {orders.purchases.map((o) => (
                          <div key={o.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{o.listing.title}</p>
                              <p className="text-xs text-muted-foreground">@{o.seller.username}</p>
                            </div>
                            <span className="shrink-0 font-bold text-red-500">-{o.priceCoins}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">{t('marketplace.mySales')}</h4>
                    {orders.sales.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">{t('marketplace.noOrders')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {orders.sales.map((o) => (
                          <div key={o.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{o.listing.title}</p>
                              <p className="text-xs text-muted-foreground">@{o.buyer.username}</p>
                            </div>
                            <span className="shrink-0 font-bold text-emerald-500">+{o.priceCoins}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
