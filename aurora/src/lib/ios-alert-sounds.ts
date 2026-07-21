/**
 * Original synthesised alert / ringtone presets inspired by classic iPhone
 * notification names. Audio files are Aurora originals under /sounds/ios/ —
 * not Apple's copyrighted assets.
 */

export type IosSoundCategory = 'alert' | 'ringtone'

export interface IosAlertSound {
  id: string
  /** English display name (classic iOS naming) */
  nameEn: string
  /** Russian display name */
  nameRu: string
  category: IosSoundCategory
  /** Public URL */
  src: string
}

const wav = (id: string) => `/sounds/ios/${id}.wav`

/** Short message / notification alerts */
export const IOS_ALERT_SOUNDS: IosAlertSound[] = [
  { id: 'note', nameEn: 'Note', nameRu: 'Нота', category: 'alert', src: wav('note') },
  { id: 'aurora', nameEn: 'Aurora', nameRu: 'Аврора', category: 'alert', src: wav('aurora') },
  { id: 'bamboo', nameEn: 'Bamboo', nameRu: 'Бамбук', category: 'alert', src: wav('bamboo') },
  { id: 'chord', nameEn: 'Chord', nameRu: 'Аккорд', category: 'alert', src: wav('chord') },
  { id: 'circles', nameEn: 'Circles', nameRu: 'Круги', category: 'alert', src: wav('circles') },
  { id: 'complete', nameEn: 'Complete', nameRu: 'Готово', category: 'alert', src: wav('complete') },
  { id: 'hello', nameEn: 'Hello', nameRu: 'Привет', category: 'alert', src: wav('hello') },
  { id: 'input', nameEn: 'Input', nameRu: 'Ввод', category: 'alert', src: wav('input') },
  { id: 'keys', nameEn: 'Keys', nameRu: 'Клавиши', category: 'alert', src: wav('keys') },
  { id: 'popcorn', nameEn: 'Popcorn', nameRu: 'Попкорн', category: 'alert', src: wav('popcorn') },
  { id: 'pulse', nameEn: 'Pulse', nameRu: 'Пульс', category: 'alert', src: wav('pulse') },
  { id: 'synth', nameEn: 'Synth', nameRu: 'Синтез', category: 'alert', src: wav('synth') },
  { id: 'tri-tone', nameEn: 'Tri-tone', nameRu: 'Тритон', category: 'alert', src: wav('tri-tone') },
  { id: 'alert', nameEn: 'Alert', nameRu: 'Сигнал', category: 'alert', src: wav('alert') },
  { id: 'glass', nameEn: 'Glass', nameRu: 'Стекло', category: 'alert', src: wav('glass') },
  { id: 'horn', nameEn: 'Horn', nameRu: 'Горн', category: 'alert', src: wav('horn') },
  { id: 'bell', nameEn: 'Bell', nameRu: 'Колокол', category: 'alert', src: wav('bell') },
  { id: 'boing', nameEn: 'Boing', nameRu: 'Пружина', category: 'alert', src: wav('boing') },
  { id: 'telegraph', nameEn: 'Telegraph', nameRu: 'Телеграф', category: 'alert', src: wav('telegraph') },
  { id: 'tiptoes', nameEn: 'Tiptoes', nameRu: 'На цыпочках', category: 'alert', src: wav('tiptoes') },
  { id: 'typewriters', nameEn: 'Typewriters', nameRu: 'Пишущие машинки', category: 'alert', src: wav('typewriters') },
  { id: 'update', nameEn: 'Update', nameRu: 'Обновление', category: 'alert', src: wav('update') },
  { id: 'anticipate', nameEn: 'Anticipate', nameRu: 'Ожидание', category: 'alert', src: wav('anticipate') },
  { id: 'descent', nameEn: 'Descent', nameRu: 'Спуск', category: 'alert', src: wav('descent') },
  { id: 'fanfare', nameEn: 'Fanfare', nameRu: 'Фанфары', category: 'alert', src: wav('fanfare') },
  { id: 'ladder', nameEn: 'Ladder', nameRu: 'Лестница', category: 'alert', src: wav('ladder') },
  { id: 'minuet', nameEn: 'Minuet', nameRu: 'Менуэт', category: 'alert', src: wav('minuet') },
  { id: 'news-flash', nameEn: 'News Flash', nameRu: 'Новости', category: 'alert', src: wav('news-flash') },
  { id: 'noir', nameEn: 'Noir', nameRu: 'Нуар', category: 'alert', src: wav('noir') },
  { id: 'sherwood', nameEn: 'Sherwood Forest', nameRu: 'Шервуд', category: 'alert', src: wav('sherwood') },
  { id: 'spell', nameEn: 'Spell', nameRu: 'Заклинание', category: 'alert', src: wav('spell') },
  { id: 'suspense', nameEn: 'Suspense', nameRu: 'Саспенс', category: 'alert', src: wav('suspense') },
  { id: 'twinkle', nameEn: 'Twinkle', nameRu: 'Мерцание', category: 'alert', src: wav('twinkle') },
  { id: 'vogel', nameEn: 'Vogel', nameRu: 'Фогель', category: 'alert', src: wav('vogel') },
  { id: 'rebound', nameEn: 'Rebound', nameRu: 'Отскок', category: 'alert', src: wav('rebound') },
  { id: 'summit', nameEn: 'Summit', nameRu: 'Вершина', category: 'alert', src: wav('summit') },
  { id: 'crystal', nameEn: 'Crystal', nameRu: 'Кристалл', category: 'alert', src: wav('crystal') },
  { id: 'silk', nameEn: 'Silk', nameRu: 'Шёлк', category: 'alert', src: wav('silk') },
  { id: 'luminous', nameEn: 'Luminous', nameRu: 'Сияние', category: 'alert', src: wav('luminous') },
  { id: 'reflection', nameEn: 'Reflection', nameRu: 'Отражение', category: 'alert', src: wav('reflection') },
]

/** Longer call ringtones */
export const IOS_RINGTONE_SOUNDS: IosAlertSound[] = [
  { id: 'ringtone-marimba', nameEn: 'Marimba', nameRu: 'Маримба', category: 'ringtone', src: wav('ringtone-marimba') },
  { id: 'ringtone-opening', nameEn: 'Opening', nameRu: 'Увертюра', category: 'ringtone', src: wav('ringtone-opening') },
  { id: 'ringtone-radar', nameEn: 'Radar', nameRu: 'Радар', category: 'ringtone', src: wav('ringtone-radar') },
  { id: 'ringtone-sencha', nameEn: 'Sencha', nameRu: 'Сенча', category: 'ringtone', src: wav('ringtone-sencha') },
  { id: 'ringtone-ripple', nameEn: 'Ripple', nameRu: 'Рябь', category: 'ringtone', src: wav('ringtone-ripple') },
]

export const ALL_IOS_SOUNDS: IosAlertSound[] = [...IOS_ALERT_SOUNDS, ...IOS_RINGTONE_SOUNDS]

export const DEFAULT_MESSAGE_PRESET_ID = 'note'
export const DEFAULT_CALL_PRESET_ID = 'ringtone-marimba'

export function getIosSoundById(id: string | null | undefined): IosAlertSound | null {
  if (!id) return null
  return ALL_IOS_SOUNDS.find((s) => s.id === id) || null
}

export function iosSoundLabel(sound: IosAlertSound, lang: string): string {
  return lang === 'ru' ? sound.nameRu : sound.nameEn
}
