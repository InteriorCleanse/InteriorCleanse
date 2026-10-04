# Finished product spec: Picked Real Fruit Protein, [flavor]

The `quality-lot-book` agent checks every lot against this page. Fill it from
the final formula, the manufacturer's finished-product specification, and the
label consultant's review. Until a value is filled, the agent treats that
test as "no limit set" and flags it, never passes it.

Version: [1] · Approved by: [owner] · Date: [ ]

## Identity

| Item | Spec |
| --- | --- |
| Product | Picked Real Fruit Protein Drink Mix, [flavor] |
| Manufacturer and site | [name, address] |
| Serving size | [x] g (1 scoop) |
| Servings per pouch | 20 |
| Net weight per pouch | [x] g |

## Label claims to verify each lot

| Claim | Label value | Lot must show | Source |
| --- | --- | --- | --- |
| Protein per serving | 20 g [confirm] | [at least x g] | Lab report (protein method) |
| Real fruit per serving | [x] g | [x] g in the batch record | Manufacturer batch record |

FDA treats protein in whey as a naturally occurring nutrient: at least 80% of
the declared value (21 CFR 101.9(g)). Picked's own target is [100%] or more,
because the grams are a public promise. Set the number with the label
consultant.

## Heavy metals, per serving

Fill the limit column with the limit you choose. California Prop 65's safe
harbor levels set when a California warning is needed. Lead's is 0.5 µg a
day and cadmium's is 4.1 µg a day; ask the label consultant to confirm those
and give the current levels for arsenic and mercury before filling this in.

| Metal | Picked limit (µg per serving) | Prop 65 safe harbor (µg per day) |
| --- | --- | --- |
| Lead | [ ] | 0.5 [confirm] |
| Cadmium | [ ] | 4.1 [confirm] |
| Inorganic arsenic | [ ] | [ask the label consultant] |
| Mercury | [ ] | [ask the label consultant] |

The lab reports in parts per million or µg/g. Convert:
µg per serving = result in ppm × serving size in grams.

## Microbiology

Use the manufacturer's finished-product spec, confirmed by the lab.

| Test | Limit | Method |
| --- | --- | --- |
| Aerobic plate count | [ ] CFU/g | [ ] |
| Yeast and mold | [ ] CFU/g | [ ] |
| Coliforms | [ ] | [ ] |
| E. coli | Negative in [ ] g | [ ] |
| Salmonella | Negative in 25 g | [ ] |
| Staphylococcus aureus | [ ] | [ ] |

## Other

| Item | Spec |
| --- | --- |
| Moisture or water activity | [ ] |
| Appearance and taste | Matches retained approved sample |
| Allergen statement | Contains milk; [line allergens per manufacturer] |
| Lab | ISO 17025 accredited, every method inside its scope |
