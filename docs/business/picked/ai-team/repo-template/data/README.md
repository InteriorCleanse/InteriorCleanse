# data/: weekly numbers for the agents

Drop aggregated exports here every Sunday morning, before the
`sunday-report` routine runs. **No customer names, emails, addresses, or
order-level rows.** Raw exports that contain them go in `data/raw/` or
`data/private/`, both gitignored, and never reach a cloud run.

| File | From | Columns |
| --- | --- | --- |
| `sales-YYYY-Www.csv` | Shopify, Analytics, "Sales over time" report, by week and product | week, product, variant, orders, units, gross_sales, discounts, returns, net_sales |
| `stock-YYYY-Www.csv` | Shopify inventory export, or the 3PL's report | product, variant, lot, on_hand, committed, available |
| `email-YYYY-Www.csv` | Klaviyo, Analytics, campaign and flow performance | name, type, recipients, opens, clicks, orders, revenue, unsubscribes |
| `social-YYYY-Www.csv` | TikTok and Instagram analytics, typed in or exported | platform, followers, posts, views, avg_watch_seconds, shares, saves, profile_visits, link_clicks |
| `waitlist-YYYY-Www.csv` | Klaviyo list growth and UTM source report | source, new_signups, total |
| `cash-YYYY-Www.csv` | You, from the bank and Shopify payouts | cash_on_hand, ad_spend, creator_spend, other_spend |
| `tax-YYYY-MM.csv` | Shopify Tax, liability insights, monthly | state, cumulative_sales, cumulative_transactions |

A missing file means the agent writes "no data". It never estimates.
