import { ChatView } from '@/components/Concierge'

export const metadata = { title: 'Concierge', description: 'Ask the AVANT concierge to find a car, price a trip or explain coverage.' }

export default function ConciergePage() {
  return (
    <div className="page page-narrow">
      <p className="eyebrow">Concierge</p>
      <h1 className="page-title" style={{ margin: '10px 0 20px' }}>
        Ask for the car. <em>Not the form.</em>
      </h1>
      <div className="panel" style={{ padding: 0, height: 'min(70vh, 720px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <ChatView autoFocus />
      </div>
      <p className="small dim" style={{ marginTop: 12 }}>
        Conversations are not stored by AVANT. Never share licence, card or ID numbers in chat.
      </p>
    </div>
  )
}
