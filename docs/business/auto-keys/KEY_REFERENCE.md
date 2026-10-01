# Key codes and programming reference

## Why there is no list of every key code

There is no master list, and this file does not contain one. Every vehicle
has its own key code. There are hundreds of millions of them. Manufacturers
hold them and release one at a time, only to the owner through a dealer or
to a NASTF-vetted locksmith who has verified ownership. A published list
would let anyone cut a key to a stranger's car, which is why one does not
legitimately exist. The sections below are how a working locksmith gets the
code for the one car in front of them.

## Two different "codes"

| Code | What it is | Where it comes from |
| --- | --- | --- |
| **Key code** | A short reference, often 4 to 6 characters, that maps to the cut depths of the blade, called the bitting | The manufacturer by VIN, the original key tag, or decoding the lock |
| **Immobilizer PIN** | A 4- to 20-digit security code that lets a programmer add keys to the car's immobilizer | The manufacturer by VIN, or read from the car by the programmer on many models |

The key machine converts a key code into cut depths with its built-in
database. InstaCode is the standard desktop reference for code series
across makes.

## Getting the code, in order of preference

1. **Copy a working key** on the key machine. No code needed.
2. **Original paperwork.** Some owners still have the key code tag.
3. **Manufacturer by VIN** through your NASTF LSID on the OEM service site.
   Pay per code. Keep the ownership documents with the job record.
4. **Dealer parts counter.** Some dealers sell the code to a locksmith with
   NASTF credentials and the owner's documents.
5. **Decode the lock** with a Lishi 2-in-1 pick on the door or trunk, read
   the depths, and fill missing cuts with the machine's code-finding
   function.
6. **Pull and read a lock cylinder.** Some cylinders are stamped with the
   code.

The PIN follows the same order, except that many programmers read it from
the car directly, and some makes, notably Hyundai, Kia, and newer Nissan,
usually need the OEM-issued PIN.

---

## Reference by make

This table is a field starting point, not a lookup to trust blindly. Year
bands are approximate and vary by model and market. Always confirm the
blade, chip, and procedure in the programmer's vehicle menu and in the
Ilco, Keyline, or Strattec application guide for the exact VIN.

| Make | Common blade profiles | Transponder families, roughly oldest to newest | Programming notes |
| --- | --- | --- | --- |
| **Toyota / Lexus** | TOY43 and TOY44 edge-cut; TOY48 high-security on Lexus and some Toyota | Texas 4C, then 4D-67 "G", then 128-bit "H"; smart keys use 8A and newer | OBD add on most. Many smart-key all-keys-lost jobs need a bypass adapter. Some 2022+ platforms have limited aftermarket support |
| **Honda / Acura** | HON66 high-security | ID13, then ID46, then ID47 | OBD add on most. Smart keys mostly ID47 |
| **Ford / Lincoln** | Older Ford 8- and 10-cut profiles; HU101 on most 2011+ | Texas 4C, then 4D-63 80-bit, then Hitag Pro on smart and flip keys | Two working keys allow onboard add on many older models. All-keys-lost needs a programmer. Some newer models need an extra unlock cable |
| **GM: Chevy, GMC, Buick, Cadillac** | Older GM edge-cut profiles; HU100 on most 2010+ | VATS resistor pellets, then Passlock with no chip in the key, then ID46 "Circle Plus" and PK3, then Hitag AES on newer smart keys | Passlock cars use a 10- or 30-minute relearn. Newer models are OBD with a programmer |
| **Chrysler, Dodge, Jeep, Ram** | CY24 on most pre-FOBIK models; emergency blades on FOBIK and smart keys | ID46, then FOBIK ID46, then Hitag AES on newer | 2018+ vehicles have a security gateway that blocks programming without AutoAuth or a bypass cable. Many need the PIN |
| **Nissan / Infiniti** | NSN14 on most; NSN11 on older | 4D-60, then ID46, then Hitag AES on newer smart keys | Older cars convert a 5-digit code to a 4-digit PIN. Newer cars use a 20-digit code from the OEM |
| **Hyundai / Kia** | HY22, KK12, and others by model | 4D-60 and 4D-70, then ID46, then ID47 and 8A on smart keys | PIN usually from the OEM through NASTF |
| **Subaru** | Varies by model and year | 4D-62, then G, then H | OBD with a programmer on most |
| **Mazda** | MAZ24 on many | 4D-63, then Hitag Pro on smart keys | OBD on most |
| **Volkswagen / Audi** | HU66 | ID48 on immobilizer 3 and 4, then Megamos AES on MQB platforms | Many need EEPROM or dash reading on all-keys-lost. Newest platforms need online OEM sessions |
| **BMW / Mini** | HU92 on older; HU100R on later | Older EWS systems, then ID46 on CAS1 to CAS4, then Hitag Pro on FEM and BDC | CAS and FEM work often means pulling the module and reading it on the bench |
| **Mercedes-Benz** | HU64 on older; emergency blades in newer keys | Infrared keys on the EIS/EZS system | FBS3 keys are made through a key-data process with specialist tools. FBS4 is dealer-only |

---

## Dealer-only, or close to it

Refer these out unless your tools explicitly list support for the exact
model and year. Check again with each tool update, because the list
shrinks as aftermarket support catches up.

- **Mercedes-Benz with FBS4**, roughly 2015 and newer.
- **Tesla.** Keys and key cards are paired by the owner in the app with an
  existing key, or by Tesla service.
- **Newest BMW platforms** with limited aftermarket support.
- **Volkswagen Group platforms** that need online component protection.
- **Volvo, Jaguar, Land Rover, and Porsche** late models, depending on tool
  coverage.
- **Rivian, Lucid, and other phone-key EVs.**

---

## What to keep on the van for the first 90 days

Stock blanks and fobs for the vehicles you see most. Pull your area's top
sellers from local dealer lots and your own call log, not from a national
list. A typical first order covers Toyota, Honda, Ford, GM, Nissan,
Hyundai, Kia, and Stellantis in the model years your area drives most.
