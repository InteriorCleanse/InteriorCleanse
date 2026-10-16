'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Dropdown, type Option } from './Dropdown'
import { MAKES, yearsFor, type Make, type Model } from '@/lib/vehicles'

// The 3D key renders client-only (WebGL); keep it out of SSR and show a
// lightweight placeholder while the canvas boots.
const KeyForge3D = dynamic(() => import('./KeyForge3D'), {
  ssr: false,
  loading: () => <div className="forge-loading">Rendering your key…</div>,
})
import { FAMILIES, type FamilyId } from '@/lib/keyFamilies'
import { SHELL_COLORS, FINISHES } from '@/lib/catalog'
import { useCart } from './CartProvider'

const TIER_LABEL: Record<string, string> = { mainstream: '', luxury: 'Luxury', supercar: 'Supercar' }

// Friendly key-style choices for manual entry, so a car that isn't in the list
// can still be configured. Feasibility is always confirmed by VIN before pay.
const STYLE_CHOICES: { value: FamilyId; label: string }[] = [
  { value: 'smart', label: 'Smart key (push-to-start)' },
  { value: 'remotehead', label: 'Remote-head key' },
  { value: 'flip', label: 'Flip / switchblade key' },
  { value: 'luxury', label: 'Luxury smart key' },
  { value: 'supercar', label: 'Supercar (OEM shell)' },
]

export function KeyStudio() {
  const { add } = useCart()
  const [makeName, setMakeName] = useState('')
  const [modelName, setModelName] = useState('')
  const [year, setYear] = useState('')
  const [typeId, setTypeId] = useState('')
  const [color, setColor] = useState<(typeof SHELL_COLORS)[number]>(SHELL_COLORS[0])
  const [finish, setFinish] = useState<(typeof FINISHES)[number]>(FINISHES[0])
  const [engrave, setEngrave] = useState('')

  // Manual entry (any car not in the list).
  const [manual, setManual] = useState(false)
  const [mMake, setMMake] = useState('')
  const [mModel, setMModel] = useState('')
  const [mYear, setMYear] = useState('')
  const [mStyle, setMStyle] = useState<FamilyId>('smart')

  const make: Make | undefined = MAKES.find((m) => m.name === makeName)
  const model: Model | undefined = make?.models.find((m) => m.name === modelName)
  const family: FamilyId = manual ? mStyle : (model?.family ?? make?.family ?? 'smart')
  const fam = FAMILIES[family]

  const makeOptions: Option[] = useMemo(
    () => MAKES.map((m) => ({ value: m.name, label: m.name, hint: TIER_LABEL[m.tier] || undefined })), [])
  const modelOptions: Option[] = make ? make.models.map((m) => ({ value: m.name, label: m.name })) : []
  const yearOptions: Option[] = model ? yearsFor(model).map((y) => ({ value: String(y), label: String(y) })) : []
  const typeOptions: Option[] = fam.types.map((t) => ({ value: t.id, label: t.label, hint: t.base ? `$${t.base}` : 'quoted' }))
  const styleOptions: Option[] = STYLE_CHOICES.map((s) => ({ value: s.value, label: s.label }))

  const selType = fam.types.find((t) => t.id === typeId) ?? fam.types[0]
  const finishPremium = finish.id === 'carbon' || finish.id === 'chrome' ? 15 : 0
  const price = selType.base ? selType.base + finishPremium : 0

  const yearOk = manual ? /^\d{4}$/.test(mYear.trim()) : !!year
  const ready = manual ? !!(mMake.trim() && mModel.trim() && yearOk) : !!(make && model && year)
  const coordinated = selType.base === 0

  const dispYear = manual ? mYear.trim() : year
  const dispMake = manual ? mMake.trim() : makeName
  const dispModel = manual ? mModel.trim() : modelName

  const onMake = (v: string) => { setMakeName(v); setModelName(''); setYear(''); setTypeId('') }
  const onModel = (v: string) => { setModelName(v); setYear(''); setTypeId('') }
  const onStyle = (v: string) => { setMStyle(v as FamilyId); setTypeId('') }

  const addToBag = () => {
    const label = `${dispYear} ${dispMake} ${dispModel}`
    add({
      key: `veh-${label}-${selType.id}-${finish.id}-${color.hex}-${engrave}`,
      name: coordinated ? `${label} — OEM key, coordinated` : `${label} — ${selType.label.toLowerCase()}`,
      price,
      meta: `${color.name} · ${finish.label}${engrave ? ` · "${engrave.toUpperCase()}"` : ''}${manual ? ' · confirm by VIN' : ''}`,
    }, coordinated ? 'Added · price quoted per car' : 'Added to cart · example')
  }

  return (
    <section id="build">
      <div className="shead">
        <div><div className="kicker">Design studio</div><h2>Build a key for any car</h2></div>
        <span className="ex" style={{ color: 'var(--muted)' }}>Mainstream · Luxury · Supercar · and anything not listed</span>
      </div>

      <div className="studio reveal">
        <div className="studio-stage">
          <div className="forge" data-fob>
            <KeyForge3D family={family} color={color.hex} finish={finish.id} engrave={engrave || dispMake} accent="#c9a86a" />
            <div className="forge-hint">DRAG TO ROTATE · SCROLL TO ZOOM</div>
          </div>
          <div className="stage-caption">
            {ready ? (
              <>
                <div className="sc-title">{dispYear} {dispMake} {dispModel}</div>
                <div className="sc-sub">{fam.label}</div>
              </>
            ) : (
              <div className="sc-sub">Pick your vehicle to see its key</div>
            )}
          </div>
        </div>

        <div className="studio-opts">
          {manual ? (
            <>
              <div className="selgrid">
                <div className="opt">
                  <label htmlFor="mmake">MAKE</label>
                  <input id="mmake" className="field" style={{ textTransform: 'none' }} value={mMake} onChange={(e) => setMMake(e.target.value)} placeholder="e.g. Peugeot" />
                </div>
                <div className="opt">
                  <label htmlFor="mmodel">MODEL</label>
                  <input id="mmodel" className="field" style={{ textTransform: 'none' }} value={mModel} onChange={(e) => setMModel(e.target.value)} placeholder="e.g. 308" />
                </div>
                <div className="opt">
                  <label htmlFor="myear">YEAR</label>
                  <input id="myear" className="field" inputMode="numeric" maxLength={4} value={mYear} onChange={(e) => setMYear(e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 2019" />
                </div>
                <Dropdown label="KEY STYLE" value={mStyle} options={styleOptions} onChange={onStyle} placeholder="Key style" />
              </div>
              <button type="button" className="linklike" onClick={() => setManual(false)}>← Back to the list</button>
            </>
          ) : (
            <>
              <div className="selgrid">
                <Dropdown label="MAKE" value={makeName} options={makeOptions} onChange={onMake} placeholder="Choose make" searchable />
                <Dropdown label="MODEL" value={modelName} options={modelOptions} onChange={onModel} placeholder={make ? 'Choose model' : 'Make first'} disabled={!make} searchable />
                <Dropdown label="YEAR" value={year} options={yearOptions} onChange={setYear} placeholder={model ? 'Year' : '—'} disabled={!model} />
                <Dropdown label="KEY TYPE" value={selType.id} options={typeOptions} onChange={setTypeId} placeholder="Key type" disabled={!ready} />
              </div>
              <button type="button" className="linklike" onClick={() => setManual(true)}>Don&apos;t see your car? Enter it manually →</button>
            </>
          )}

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
              <span className="dot" /> {manual ? 'We confirm feasibility and your flat price by VIN before you pay.' : fam.note}
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
