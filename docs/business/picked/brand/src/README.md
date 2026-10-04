Scripts that drew the Picked wordmark and pouch concepts from font outlines.
Run from a folder holding brico800.ttf (Bricolage Grotesque 800), franklin500.ttf
and franklin700.ttf (Libre Franklin) from Google Fonts: `pip install fonttools segno`,
then `python3 wordmark.py` (writes wordpath.txt and the logo SVGs) and
`python3 pouch.py`, then `python3 packaging2.py` (back panel with the real Lot Book QR code, sticks, display, shaker, and `qr-lot-book.svg`). Edit OUT at the top of each script to point at brand/.
