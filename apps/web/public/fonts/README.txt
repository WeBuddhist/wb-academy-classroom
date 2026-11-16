Typefaces from the WeBuddhist Academy brand package.

  DM Sans              interface text (Latin)
  Cormorant Garamond   headings
  Noto Serif Tibetan   interface text (Tibetan)
  Jomolhari            the texts themselves (Tibetan)

The two Tibetan faces are subset to the Tibetan block (U+0F00-0FFF) and converted to
woff2, which takes Jomolhari from 2.0 MB to 347 KB and Noto Serif Tibetan from 719 KB
to 148 KB. Latin text is served by DM Sans; the unicode-range in fonts.css is what
routes each script to the right face.

All four are licensed under the SIL Open Font License; see the OFL-*.txt files here.
