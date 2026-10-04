'use client'

import { useMemo, useState } from 'react'
import { Dropdown, type Option } from './Dropdown'
import { KeyModel } from './KeyModel'
import { MAKES, yearsFor, type Make, type Model } from '@/lib/vehicles'
import { FAMILIES } from '@/lib/keyFamilies'
import { SHELL_COLORS, FINISHES } from '@/lib/catalog'
import { useCart } from './CartProvider'

const TIER_LABEL: Record<string, string> = { mainstream: '', luxury: 'Luxury', supercar: 'Supercar' }

export function KeyStudio() {
  const { add } = useCart()
  const [makeName, setMakeName] = useState('')
  const [modelName, setModelName] = useState('')
  const [year, setYear] = useState('')
  const [typeId, setTypeId] = useState('')
  const [color, setColor] = useState<(typeof SHELL_COLORS)[number]>(SHELL_COLORS[0])
  const [finish, setFinish] = useState<(typeof FINISHES)[number]>(FINISHES[0])
  const [engrave, setEngrave] = useState('')

  const make: Make | undefined = MAKES.find((m) => m.name === makeName)
  const model: Model | undefined = make?.models.find((m) => m.name === modelName)
  const family = model?.family ?? make?.family ?? 'smart'
  const fam = FAMILIES[family]

  const makeOptions: Option[] = useMemo(
    () => MAKES.map((m) => ({ value: m.name, label: m.name, hint: TIER_LABEL[m.tier] || undefined })), [])
  const modelOptions: Option[] = make ? make.models.map((m) => ({ value: m.name, label: m.name })) : []
  const yearOptions: Option[] = model ? yearsFor(model).map((y) => ({ value: String(y), label: String(y) })) : []
  const typeOptions: Option[] = fam.types.map((t) => ({ value: t.id, label: t.label, hint: t.base ? `$${t.base}` : 'quoted' }))

  const selType = fam.types.find((t) => t.id === typeId) ?? fam.types[0]
  const finishPremium = finish.id === 'carbon' || finish.id === 'chrome' ? 15 : 0
  const price = selType.base ? selType.base + finishPremium : 0
  const ready = make && model && year
  const coordinated = selType.base === 0

  const onMake = (v: string) => { setMakeName(v); setModelName(''); setYear(''); setTypeId('') }
  const onModel = (v: string) => { setModelName(v); setYear(''); setTypeId('') }

  const addToBag = () => {
    const label = `${year} ${makeName} ${modelName}`
    add({
      key: `veh-${label}-${selType.id}-${finish.id}-${color.hex}-${engrave}`,
      name: coordinated ? `${label} — OEM key, coordinated` : `${label} — ${selType.label.toLowerCase()}`,
      price,
      meta: `${color.name} · ${finish.label}${engrave ? ` · "${engrave.toUpperCase()}"` : ''}`,
    }, coordinated ? 'Added · price quoted per car' : 'Added to cart · example')
  }

  return (
    <section id="build">
      <div className="shead">
        <div><div className="kicker">Design studio</div><h2>Build a key for any car</h2></div>
        <span className="ex" style={{ color: 'var(--muted)' }}>Mainstream · Luxury · Supercar</span>
      </div>

      <div className="studio reveal">
        <div className="studio-stage">
          <div className={`keywrap finish-${finish.id}`} data-fob style={{ ['--shell' as string]: color.hex }}>
            {ready ? <KeyModel family={family} color={color.hex} finish={finish.id} engrave={engrave || makeName} /> : <KeyModel family="smart" color={color.hex} finish={finish.id} engrave={engrave} />}
          </div>
          <div className="stage-caption">
            {ready ? (
              <>
                <div className="sc-title">{year} {makeName} {modelName}</div>
                <div className="sc-sub">{fam.label}</div>
              </>
            ) : (
              <div className="sc-sub">Pick your vehicle to see its key</div>
            )}
          </div>
        </div>

        <div className="studio-opts">
          <div className="selgrid">
            <Dropdown label="MAKE" value={makeName} options={makeOptions} onChange={onMake} placeholder="Choose make" searchable />
            <Dropdown label="MODEL" value={modelName} options={modelOptions} onChange={onModel} placeholder={make ? 'Choose model' : 'Make first'} disabled={!make} searchable />
            <Dropdown label="YEAR" value={year} options={yearOptions} onChange={setYear} placeholder={model ? 'Year' : '—'} disabled={!model} />
            <Dropdown label="KEY TYPE" value={selType.id} options={typeOptions} onChange={setTypeId} placeholder="Key type" disabled={!ready} />
          </div>

          <div className="opt">
            <label>::SHELL COLOR</label>
            <div className="swatches">
              {SHELL_COLORS.map((s) => (
                <button key={s.hex} className="sw" style={{ background: s.hex }} aria-pressed={color.hex === s.hex} aria-label={s.name} onClick={() => setColor(s)} />
              ))}
            </div>
          </div>
          <div className="opt">
            <label>::FINISH</label>
            <div className="segs">
              {FINISHES.map((f) => (
                <button key={f.id} className="seg" aria-pressed={finish.id === f.id} onClick={() => setFinish(f)}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="opt">
            <label htmlFor="eng">::ENGRAVING (12 CHARS)</label>
            <input id="eng" className="field" maxLength={12} value={engrave} onChange={(e) => setEngrave(e.target.value)} placeholder="NAME / INITIALS" />
          </div>

          {ready && (
            <div className={`fnote ${fam.fulfillment}`}>
              <span className="dot" /> {fam.note}
            </div>
          )}

          <div className="priceline">
            <div>
              <div className="amt">{coordinated ? 'Quoted' : `$${price}`}</div>
              <div className="ex">{coordinated ? 'OEM key · price confirmed per car' : 'EXAMPLE PRICING · set at launch'}</div>
            </div>
            <button className="btn glow" disabled={!ready} onClick={addToBag}>{ready ? 'ADD TO CART' : 'PICK A VEHICLE'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
