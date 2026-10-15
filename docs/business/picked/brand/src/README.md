Scripts that drew the Picked wordmark and pouch concepts from font outlines.
Run from a folder holding brico800.ttf (Bricolage Grotesque 800), franklin500.ttf
and franklin700.ttf (Libre Franklin) from Google Fonts: `pip install fonttools segno`,
then `python3 wordmark.py` (writes wordpath.txt and the wordmark SVGs: the leaf sprouts from the i on a short stalk), `python3 mark.py ../` (the mark and favicon: a p with the same leaf), and
`python3 pouch.py`, then `python3 packaging2.py` (back panel with the real Lot Book QR code, sticks, display, shaker, and `qr-lot-book.svg`). `python3 device.py` draws the fruit sticker and the cut-open fruit. Edit OUT at the top of each script to point at brand/.

`python3 unboxing.py` draws the mailer box faces and the insert card into `brand/unboxing/`.
`python3 sting.py` then `node render_sting.js` builds the 3.6-second brand sting in `brand/motion/`.
