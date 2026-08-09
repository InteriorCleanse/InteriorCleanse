import Link from 'next/link'
import { ProductExperience } from '@/components/product/ProductExperience'
import type { Article, Book, Product, SpiritBook } from '@/lib/types'

/** A channel URL is only real once the owner has replaced the TODO marker. */
export const validUrl = (url?: string) => Boolean(url && url !== 'TODO')

export function ProductCard({
  product,
  index = 0,
}: {
  product: Product
  index?: number
}) {
  return (
    <article className="product-card">
      <Link href={`/shop/${product.slug}/`} className="product-card-image">
        <ProductExperience product={product} variant="card" eager={index < 3} />
        {product.badge ? <span className="product-card-badge">{product.badge}</span> : null}
      </Link>
      <div className="product-card-info">
        <p className="product-card-category">{product.category}</p>
        <h3 className="product-card-name">
          <Link href={`/shop/${product.slug}/`}>{product.name}</Link>
        </h3>
        <p className="product-card-tagline">{product.tagline}</p>
        <p className="product-card-price">
          {product.price ? `$${product.price}` : 'View →'}
        </p>
      </div>
    </article>
  )
}

export function BookCard({ book }: { book: Book }) {
  return (
    <article className="book-card">
      <Link href={`/library/${book.slug}/`} className="book-card-image">
        <img src={book.coverImage} alt={book.imageAlt} loading="lazy" />
      </Link>
      <div className="book-card-info">
        <p className="eyebrow" style={{ fontSize: '9px' }}>
          The Library
        </p>
        <h3 className="book-card-title">
          <Link href={`/library/${book.slug}/`}>{book.title}</Link>
        </h3>
        <p className="book-card-hook">{book.hook}</p>
        <div className="book-buy-buttons">
          <a
            href={book.paperbackUrl}
            target="_blank"
            rel="noreferrer"
            className="book-buy-btn"
          >
            Paperback ↗
          </a>
          <a
            href={book.kindleUrl}
            target="_blank"
            rel="noreferrer"
            className="book-buy-btn"
          >
            Kindle ↗
          </a>
        </div>
      </div>
    </article>
  )
}

export function SpiritCard({ book }: { book: SpiritBook }) {
  return (
    <article className="spirit-card">
      <div className="spirit-card-image">
        <img src={book.coverImage} alt={book.imageAlt} loading="lazy" />
        {book.badge ? <span className="spirit-badge">{book.badge}</span> : null}
      </div>
      <p className="spirit-category">{book.category}</p>
      <h3 className="spirit-title">{book.title}</h3>
      <p className="spirit-subtitle">{book.subtitle}</p>
      <p className="spirit-desc">{book.description}</p>
      <div className="spirit-foot">
        <span className="spirit-price">{book.price}</span>
        <a href={book.amazonUrl} target="_blank" rel="noreferrer" className="spirit-buy">
          Buy ↗
        </a>
      </div>
    </article>
  )
}

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article data-reveal>
      <Link href={`/journal/${article.slug}/`} className="article-card-image">
        <img src={article.image} alt={article.imageAlt} loading="lazy" />
      </Link>
      <p className="eyebrow" style={{ marginBottom: '0.8rem' }}>
        {article.eyebrow}
      </p>
      <h3 className="article-card-title">
        <Link href={`/journal/${article.slug}/`}>{article.title}</Link>
      </h3>
      <p className="article-card-excerpt">{article.excerpt}</p>
    </article>
  )
}
