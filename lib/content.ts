import products from '@/content/products.json'
import books from '@/content/books.json'
import type { Article, Book, Product, SpiritBook } from './types'

export const allProducts = products as Product[]
export const allBooks = books as Book[]

export const getProduct = (slug: string) => allProducts.find((p) => p.slug === slug)
export const getBook = (slug: string) => allBooks.find((b) => b.slug === slug)

/** Books without an explicit track sit in the main library. */
export const mindBooks = allBooks.filter((b) => !b.track || b.track === 'mind')
export const healthBooks = allBooks.filter((b) => b.track === 'health')

export const spiritBooks: SpiritBook[] = [
  {
    slug: 'holy-bible-kjv',
    title: 'The Holy Bible',
    subtitle: 'King James Version',
    category: 'bible',
    coverImage: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=600&q=90',
    imageAlt: 'An open Bible resting on a wooden table in warm light',
    description:
      'The complete King James Version. A timeless cornerstone for faith, reflection, and daily devotion.',
    amazonUrl: 'https://www.amazon.com/s?k=holy+bible+kjv',
    price: 'From $8.99',
    badge: 'FEATURED',
  },
  {
    slug: 'daily-devotional-journal',
    title: 'Daily Devotional Journal',
    subtitle: '365 Days of Scripture & Reflection',
    category: 'devotional',
    coverImage: 'https://images.unsplash.com/photo-1518655048521-f130df041f66?w=600&q=90',
    imageAlt: 'A devotional journal and pen on a quiet desk',
    description:
      'A year of guided daily devotions — scripture readings, reflection prompts, and space for prayer journaling.',
    amazonUrl: 'https://www.amazon.com/',
    price: '$14.99',
    badge: 'NEW',
  },
  {
    slug: 'kids-bible-story-coloring-book',
    title: 'Kids Bible Story Coloring Book',
    subtitle: 'Bold & Easy — Ages 4–8',
    category: 'coloring / kids',
    coverImage: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=600&q=90',
    imageAlt: 'Colouring pencils arranged beside an open activity book',
    description:
      'Fun Bible story scenes for young readers to colour and enjoy. Bold thick lines, easy for little hands.',
    amazonUrl: 'https://www.amazon.com/',
    price: '$7.99',
    badge: 'NEW',
  },
  {
    slug: 'bible-verse-coloring-book-adults',
    title: 'Bible Verse Coloring Book for Adults',
    subtitle: 'Mindful Faith-Based Art Therapy',
    category: 'coloring / adult',
    coverImage: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&q=90',
    imageAlt: 'A calm desk with a colouring book and brush pens',
    description:
      'Calming botanical illustrations paired with scripture verses. Premium paper, 50 unique designs.',
    amazonUrl: 'https://www.amazon.com/',
    price: '$9.99',
    badge: 'BESTSELLER',
  },
]

export const getSpiritBook = (slug: string) => spiritBooks.find((b) => b.slug === slug)

export const articles: Article[] = [
  {
    slug: 'five-minute-evening-reset',
    title: 'The Five-Minute Evening Reset',
    eyebrow: 'HOME RITUALS',
    excerpt:
      "A quiet closing routine that keeps tomorrow from inheriting today's clutter.",
    date: '2026-06-01',
    image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=85',
    imageAlt: 'Neutral living room with a folded throw at evening',
    body: [
      'Begin where the day gathered: the entry, the sofa, the kitchen counter. A reset is not a performance; it is a small return to baseline.',
      'Choose one surface, one basket, and one closing gesture. The goal is not a perfect home, but a home that welcomes you back in the morning.',
    ],
  },
  {
    slug: 'how-to-edit-a-cleaning-shelf',
    title: 'How to Edit a Cleaning Shelf',
    eyebrow: 'CLEANING EDIT',
    excerpt:
      'Keep fewer products, place them better, and make the routine easier to repeat.',
    date: '2026-05-18',
    image: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&q=85',
    imageAlt: 'Organized cleaning shelf with neutral bottles',
    body: [
      'Pull everything out first. Group by job, remove duplicates, and keep the products that earn their space through regular use.',
      'A beautiful shelf is useful only when it lowers friction. Label zones by action: daily wipe, laundry, glass, floors, and refills.',
    ],
  },
]

export const getArticle = (slug: string) => articles.find((a) => a.slug === slug)
