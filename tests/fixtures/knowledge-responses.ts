/**
 * Recorded Notion and HubSpot responses, trimmed to the fields the adapters
 * read plus a few they must ignore. The vendor conventions are kept because
 * they are where the bugs live: Notion's rich-text runs and nested children,
 * HubSpot's every-property-is-a-string and its epoch-millisecond timestamps.
 *
 * No real ids, tokens, people or companies.
 */

export const notionSearchPage1 = {
  object: 'list',
  has_more: true,
  next_cursor: 'cursor-2',
  results: [
    {
      object: 'page',
      id: 'page-refunds',
      url: 'https://www.notion.so/Refund-policy-page-refunds',
      last_edited_time: '2025-06-10T09:00:00.000Z',
      archived: false,
      properties: {
        title: { type: 'title', title: [{ plain_text: 'Refund policy' }] },
      },
    },
    {
      // Archived: must be skipped.
      object: 'page',
      id: 'page-archived',
      url: 'https://www.notion.so/Old-page-archived',
      last_edited_time: '2025-06-09T09:00:00.000Z',
      archived: true,
      properties: { title: { type: 'title', title: [{ plain_text: 'Old' }] } },
    },
    {
      // A database in the results: not a page, skipped.
      object: 'database',
      id: 'db-1',
      last_edited_time: '2025-06-08T09:00:00.000Z',
      title: [{ plain_text: 'Tasks' }],
    },
    {
      // Older than the incremental cursor in the "since" test: stops paging.
      object: 'page',
      id: 'page-old',
      url: 'https://www.notion.so/Older-page-old',
      last_edited_time: '2025-01-01T09:00:00.000Z',
      archived: false,
      properties: { title: { type: 'title', title: [{ plain_text: 'Older note' }] } },
    },
  ],
}

export const notionBlocksRefunds = {
  object: 'list',
  has_more: false,
  next_cursor: null,
  results: [
    {
      id: 'b1',
      type: 'heading_2',
      has_children: false,
      heading_2: { rich_text: [{ plain_text: 'Window' }] },
    },
    {
      id: 'b2',
      type: 'paragraph',
      has_children: false,
      paragraph: {
        rich_text: [
          { plain_text: 'Refunds are accepted within ' },
          { plain_text: '30 days', annotations: { bold: true } },
          { plain_text: ' of delivery. See ' },
          { plain_text: 'the returns form', href: 'https://example.com/returns' },
          { plain_text: '.' },
        ],
      },
    },
    {
      id: 'b3',
      type: 'bulleted_list_item',
      has_children: true,
      bulleted_list_item: { rich_text: [{ plain_text: 'Wholesale orders' }] },
      // Children are fetched by a second request in the adapter test.
    },
    {
      id: 'b4',
      type: 'to_do',
      has_children: false,
      to_do: { rich_text: [{ plain_text: 'Update the FAQ' }], checked: false },
    },
    {
      id: 'b5',
      type: 'code',
      has_children: false,
      code: { rich_text: [{ plain_text: 'refund --order 1042' }], language: 'bash' },
    },
    {
      // A type the converter has never heard of, carrying text.
      id: 'b6',
      type: 'mystery_block',
      has_children: false,
      mystery_block: { rich_text: [{ plain_text: 'Do not lose this sentence.' }] },
    },
  ],
}

export const notionBlocksWholesaleChildren = {
  object: 'list',
  has_more: false,
  next_cursor: null,
  results: [
    {
      id: 'b3a',
      type: 'bulleted_list_item',
      has_children: false,
      bulleted_list_item: { rich_text: [{ plain_text: '14 days, restocking fee applies' }] },
    },
  ],
}

export const hubspotContacts = {
  results: [
    {
      id: '101',
      properties: {
        email: 'buyer@example.com',
        firstname: 'Ada',
        lastname: 'Lovelace',
        company: 'Analytical Engines Ltd',
        hs_lastmodifieddate: '2025-06-10T10:00:00.000Z',
      },
    },
    {
      id: '102',
      properties: {
        email: null,
        firstname: '',
        lastname: 'Anonymous',
        company: null,
        hs_lastmodifieddate: '2025-06-10T11:00:00.000Z',
      },
    },
  ],
  paging: { next: { after: '200' } },
}

export const hubspotPipelines = {
  results: [
    {
      id: 'default',
      stages: [
        { id: 'stage-qualified', label: 'Qualified to buy', metadata: { isClosed: 'false', probability: '0.2' } },
        { id: 'stage-contract', label: 'Contract sent', metadata: { isClosed: 'false', probability: '0.9' } },
        { id: 'stage-won', label: 'Closed won', metadata: { isClosed: 'true', probability: '1.0' } },
        { id: 'stage-lost', label: 'Closed lost', metadata: { isClosed: 'true', probability: '0.0' } },
      ],
    },
  ],
}

export const hubspotDeals = {
  results: [
    {
      id: '5001',
      properties: {
        dealname: 'Analytical Engines — annual',
        dealstage: 'stage-contract',
        amount: '12000.50',
        deal_currency_code: 'gbp',
        closedate: '2025-07-15T00:00:00.000Z',
        hubspot_owner_id: '77',
        hs_lastmodifieddate: '2025-06-11T08:00:00.000Z',
      },
      associations: { contacts: { results: [{ id: '101' }] } },
    },
    {
      id: '5002',
      properties: {
        dealname: 'Lost one',
        dealstage: 'stage-lost',
        amount: '500',
        deal_currency_code: 'GBP',
        closedate: null,
        hubspot_owner_id: null,
        hs_lastmodifieddate: '2025-06-11T09:00:00.000Z',
      },
    },
    {
      // No amount at all: must be null, not zero.
      id: '5003',
      properties: {
        dealname: 'Early conversation',
        dealstage: 'stage-qualified',
        amount: null,
        deal_currency_code: null,
        closedate: null,
        hubspot_owner_id: null,
        hs_lastmodifieddate: '2025-06-11T10:00:00.000Z',
      },
    },
  ],
}

export const base44Suppliers = [
  {
    id: 'r1',
    name: 'Northwind Packaging',
    lead_time_days: 14,
    contact: { email: 'orders@northwind.example', phone: '+44 20 0000 0000' },
    tags: ['boxes', 'primary'],
    notes: 'Minimum order 500 units.\nShips Tuesdays.',
    is_sample: false,
    created_date: '2025-05-01T00:00:00Z',
    updated_date: '2025-06-12T00:00:00Z',
  },
  {
    // No title field of any kind: falls back to entity + id.
    id: 'r2',
    lead_time_days: 3,
    updated_date: '2025-06-11T00:00:00Z',
  },
  {
    // Older than the incremental cursor in that test: stops paging.
    id: 'r3',
    name: 'Old Supplier',
    updated_date: '2025-01-01T00:00:00Z',
  },
]
