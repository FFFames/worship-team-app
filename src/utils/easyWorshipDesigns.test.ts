/** Regression coverage for verified EasyWorship presentation-layout relationships. */

import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readEasyWorshipDefaultThemes, readEasyWorshipFoldbackSettings, readEasyWorshipLayouts, readEasyWorshipMessageStyle, readEasyWorshipNurseryStyle, reviewEasyWorshipDesigns } from './easyWorshipDesigns'
import { alertMarqueeDuration } from './messageAlertSettings'
import { backfillImportedCollectionDetails, backfillImportedLayoutDetails, easyWorshipDesignIdentityContent } from './slideDesignAssets'
import { presentationCue } from './slideDesign'
import { formatFoldbackContent } from './foldbackAppearance'
import { mediaFileHash } from './easyWorshipMedia'
import { reviewEasyWorshipProfile } from './easyWorshipProfile'
import { legacyElementDecorationWarning, unsupportedElementBorder, unsupportedElementReflection } from './easyWorshipElementBorder'

it('reads the native foldback next row and clock, including an explicitly hidden next item', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  const path = 'Default.ewo/Data/Foldback.Settings.db'
  try {
    db.run(`CREATE TABLE presentation (presentation_uid TEXT);
      CREATE TABLE slide (slide_uid TEXT);
      CREATE TABLE element (slide_id INTEGER, element_uid TEXT, background_resource_id INTEGER);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE presentation_property_group_global (link_id INTEGER, group_name TEXT);
      CREATE TABLE presentation_property_global (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE resource_color (resource_id INTEGER, color INTEGER);`)
    const source = { paths: new Map(), read: async () => new Blob([new Uint8Array(db.export())]) }
    expect(await readEasyWorshipFoldbackSettings(source, path)).toEqual({})

    db.run(`INSERT INTO presentation VALUES ('P'),('SONG');
      INSERT INTO slide VALUES ('SCRIPTURE'),('SONG');
      INSERT INTO element VALUES (1,'NEXT_SLIDE',NULL),(2,'NEXT_SLIDE',7),(2,'FOLDBACK_CLOCK',NULL),(2,'FOLDBACK_SI',7),
        (2,'CONTENT_SONG',NULL),(1,'CONTENT_SCRIPTURE',NULL);
      INSERT INTO resource_color VALUES (7,0x563412);
      INSERT INTO presentation_property_group_global VALUES (2,'NextLine_Attributes'),(1,'NextLine_Attributes'),(1,'FoldBack_Attributes'),(1,'Text_Attributes');
      INSERT INTO presentation_property_global VALUES (1,'Line_Count','1'),(2,'Line_Count','2'),
        (3,'Clock_Format','HH:NN:SS'),(3,'Clock_Location','2'),
        (3,'SI_Format','NN:SS'),(3,'SI_Location','3'),(3,'SI_Allow_Overrun','-1'),
        (4,'Proper_Words','jesus,"holy spirit",g.od');
      INSERT INTO element_property_group VALUES (2,'Element'),(2,'Text_Style_400'),(3,'Text_Style_401'),(4,'Text_Style_402'),
        (5,'Text_Style_101'),(5,'Text_Margins'),(5,'Text_Format'),(6,'Text_Style_201'),(6,'Text_Layout');
      INSERT INTO element_property VALUES (1,'Hidden','-1'),(2,'Font_Name','Tahoma'),(2,'Font_Size','0.05'),
        (3,'Font_Color','16777215'),(3,'Font_Italic','1'),(4,'Font_Name','Georgia'),
        (5,'Font_Name','Calibri'),(5,'Font_Size','0.09'),(5,'Font_Color','16711680'),(5,'Text_Alignment','0'),
        (6,'Left','0.04'),(6,'Top','0.02'),(7,'Auto_Size','1'),(7,'Normalize_Text','1'),(7,'Word_Wrapping','0'),
        (7,'Capitalize_First','1'),(7,'Capitalize_Proper','1'),
        (8,'Font_Name','Courier New'),(8,'Text_Alignment','2'),(9,'Vertical_Alignment','2');`)
    const imported = await readEasyWorshipFoldbackSettings(source, path)
    expect(imported).toMatchObject({
      appearance: {
        nextLines: 0,
        next: { backgroundColor: '#123456', fontFamily: 'Tahoma', fontRatio: 0.05 },
        clock: { enabled: true, format: 'HH:NN:SS', position: 'bottom-left', textColor: '#ffffff', italic: true },
      },
      service: { enabled: true, format: 'nn:ss', position: 'bottom-right',
        allowOverrun: true, backgroundColor: '#123456', fontFamily: 'Georgia' },
      content: {
        song: { fontFamily: 'Calibri', fontRatio: 0.09, textColor: '#0000ff', align: 'left', wrap: false,
          layout: { sizing: 'fit', insets: { left: 0.04, top: 0.02 } }, normalize: true,
          capitalizeFirst: true, properWords: ['jesus', 'holy spirit', 'g.od'] },
        scripture: { fontFamily: 'Courier New', align: 'right', verticalAlign: 'bottom' },
      },
    })
    expect(formatFoldbackContent(['hello jesus and holy spirit', 'again g.od not good', 'เรา นมัสการ'], imported.content!.song!))
      .toBe('Hello Jesus and Holy spirit\nAgain G.od not good\nเรา นมัสการ')
    db.run("UPDATE element_property SET value = '0' WHERE key = 'Hidden'")
    expect((await readEasyWorshipFoldbackSettings(source, path)).appearance?.nextLines).toBe(2)
  } finally { db.close() }
})

it('reads Scripture display preferences from the output profile record and its Scripture text styles', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  try {
    db.run(`CREATE TABLE presentation (presentation_uid TEXT, presentation_type INTEGER);
      CREATE TABLE slide (presentation_id INTEGER, slide_uid TEXT, order_index INTEGER);
      CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER);
      CREATE TABLE resource_text (resource_id INTEGER);
      CREATE TABLE presentation_property_group_global (link_id INTEGER, group_name TEXT);
      CREATE TABLE presentation_property_global (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);`)
    const source = { paths: new Map(), read: async () => new Blob([new Uint8Array(db.export())]) }
    const path = 'Default/v6.1/Options/Sunday.ewo/Data/Alt.Settings.db'
    const read = () => readEasyWorshipDefaultThemes(source, path, () => ({}))
    expect((await read()).scripture).toBeUndefined()
    db.run(`INSERT INTO presentation VALUES ('THEME',0),('P',0);
      INSERT INTO slide VALUES (1,'SCRIPTURE',0),(2,'SONG',0),(2,'SCRIPTURE',1);
      INSERT INTO element VALUES (1,'CONTENT_SCRIPTURE',0),(2,'CONTENT_SCRIPTURE',0),(3,'CONTENT_SCRIPTURE',0);
      INSERT INTO presentation_property_group_global VALUES (1,'Scripture_Attributes'),(2,'Scripture_Attributes'),(2,'Text_Attributes');
      INSERT INTO presentation_property_global VALUES (1,'Show_Reference','0'),(2,'Show_Reference','1'),
        (2,'Reference_Location','0'),(2,'Show_Complete_Passage','-1'),(2,'Abbr_Book_Names','1'),
        (2,'Enable_Scripture_Flow','-1'),(2,'One_Verse_Per_Slide','0'),(3,'Minimum_Size_Limit','0.055');
      INSERT INTO element_property_group VALUES (1,'Text_Style_201'),(2,'Text_Style_201'),
        (3,'Text_Style_201'),(3,'Text_Style_202'),(3,'Text_Style_203');
      INSERT INTO element_property VALUES (1,'Font_Name','Theme Font'),(2,'Font_Name','Wrong Slide'),
        (3,'Font_Name','Tahoma'),(3,'Font_Color',0x563412),(3,'Font_Size','0.065'),
        (3,'Font_Bold','-1'),(3,'Font_Italic','0'),(3,'Font_StrikeThrough','1'),
        (4,'Font_Name','Georgia'),(4,'Shadow_Enabled','1'),(4,'Shadow_Offset','0.003'),
        (4,'Left_Margin','0.06'),(4,'Right_Margin','0.025'),(4,'Top_Margin','0'),(4,'Bottom_Margin','5'),
        (3,'Left_Margin','0.09'),
        (5,'Font_Name','Courier New'),(5,'Hidden','0'),(5,'Font_Size','999'),
        (5,'Font_Superscript','-1'),(5,'Font_Opacity','80');`)
    expect((await read()).scripture).toEqual({ id: path, output: 'alternate', settings: {
      reference: 'before-slide', completePassage: true, verseNumbers: true, abbreviateBooks: true,
      pagination: { flow: true, breakOnVerse: false, minFontRatio: .055 },
      referenceInsets: { left: 0.06, right: 0.025, top: 0 },
      fonts: {
        text: { fontFamily: 'Tahoma', color: '#123456', fontRatio: 0.065, bold: true, italic: false, effects: { strike: true } },
        number: { fontFamily: 'Courier New', effects: { baseline: 'super', fontOpacity: 80 } },
        reference: { fontFamily: 'Georgia', effects: { shadow: { enabled: true, offset: 0.003 } } },
      },
    } })
    db.run(`UPDATE presentation_property_global SET value = '2' WHERE key = 'Reference_Location';
      UPDATE element_property SET value = '1' WHERE key = 'Hidden';`)
    expect((await read()).scripture?.settings).toMatchObject({ reference: 'after-passage', verseNumbers: false })
    db.run("UPDATE presentation_property_global SET value = 'false' WHERE key = 'Show_Reference'")
    expect((await read()).scripture?.settings.reference).toBe('hidden')
    db.run("INSERT INTO presentation_property_global VALUES (2,'Only_Show_Reference','1')")
    expect((await read()).scripture?.settings.reference).toBe('reference-only')
  } finally { db.close() }
})

it('reads the logo catalog reference from the selected output profile record', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  try {
    db.run(`CREATE TABLE presentation (presentation_uid TEXT, presentation_type INTEGER);
      CREATE TABLE slide (presentation_id INTEGER, slide_uid TEXT, order_index INTEGER);
      CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER);
      CREATE TABLE resource_text (resource_id INTEGER);
      CREATE TABLE presentation_property_group_global (link_id INTEGER, group_name TEXT);
      CREATE TABLE presentation_property_global (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO presentation VALUES ('unrelated',0),('P',0);
      INSERT INTO presentation_property_group_global VALUES (1,'Default_Logo_BK'),(2,'Default_Logo_BK');
      INSERT INTO presentation_property_global VALUES (1,'ID','12'),(1,'FileType','2'),
        (2,'ID','9007199254740995'),(2,'FileType','8');`)
    const source = { paths: new Map(), read: async () => new Blob([new Uint8Array(db.export())]) }
    const path = 'Default/v6.1/Options/Sunday.ewo/Data/Alt.Settings.db'
    const read = () => readEasyWorshipDefaultThemes(source, path, () => ({}))
    expect(await read()).toMatchObject({ logo: { id: '9007199254740995', type: 8 }, output: 'alternate', optionsName: 'Sunday' })
    db.run("UPDATE presentation_property_global SET value='0' WHERE group_id=2 AND key='ID'")
    expect((await read()).logo).toBeUndefined()
  } finally { db.close() }
})

it('imports the assigned nursery element and its output-specific global settings', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  let data: Blob
  try {
    db.run(`CREATE TABLE presentation (presentation_uid TEXT);
      CREATE TABLE slide (slide_uid TEXT);
      CREATE TABLE element (slide_id INTEGER, element_uid TEXT, background_resource_id INTEGER);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE presentation_property_group_global (link_id INTEGER, group_name TEXT);
      CREATE TABLE presentation_property_global (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE resource_color (resource_id INTEGER, color INTEGER);
      INSERT INTO presentation VALUES ('GLOBAL');
      INSERT INTO presentation_property_group_global VALUES (1,'Nursery_Attributes');
      INSERT INTO presentation_property_global VALUES (1,'Location','2'),(1,'Auto_Remove','1'),(1,'Delay','5250');
      INSERT INTO slide VALUES ('NURSERY_ALERT');
      INSERT INTO element(rowid,slide_id,element_uid,background_resource_id) VALUES (9007199254740997,1,'NURSERY_ALERT',9007199254740999);
      INSERT INTO resource_color VALUES (9007199254740999,0x563412);
      INSERT INTO element_property_group VALUES (9007199254740997,'Element'),(9007199254740997,'Background'),(9007199254740997,'Text_Style_500');
      INSERT INTO element_property VALUES (1,'Hidden','1'),(2,'Opacity','0'),(3,'Font_Color','15785680'),
        (3,'Font_Name','Courier New'),(3,'Font_Size','0.06'),(3,'Font_Bold','0'),(3,'Font_Italic','1');`)
    data = new Blob([new Uint8Array(db.export())])
  } finally { db.close() }
  const path = 'Default.ewo/Data/AltOutNursery.Settings.db'
  const result = await readEasyWorshipNurseryStyle({ paths: new Map(), read: async () => data }, path)
  expect(result).toEqual({ hasNativeStyle: true, entry: { id: path, output: 'alternate', style: {
    enabled: false, position: 'bottom-left', opacity: 0, fontSize: 65, fontRatio: 0.06, seconds: 6,
    backgroundColor: '#123456', textColor: '#d0def0', fontFamily: 'Courier New', bold: false, italic: true,
  } } })
})

it('imports the message settings for the named output and converts the native slider to travel time', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  let data: Blob
  try {
    db.run(`CREATE TABLE presentation (presentation_uid TEXT);
      CREATE TABLE slide (slide_uid TEXT);
      CREATE TABLE element (slide_id INTEGER, element_uid TEXT, background_resource_id INTEGER);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE presentation_property_group_global (link_id INTEGER, group_name TEXT);
      CREATE TABLE presentation_property_global (group_id INTEGER, key TEXT, value TEXT);
      CREATE TABLE resource_color (resource_id INTEGER, color INTEGER);
      INSERT INTO presentation VALUES ('GLOBAL');
      INSERT INTO presentation_property_group_global VALUES (1,'Message_Attributes');
      INSERT INTO presentation_property_global VALUES (1,'Location','1'),(1,'ScrollSpeed','80');
      INSERT INTO slide VALUES ('MESSAGE_ALERT');
      INSERT INTO element VALUES (1,'MESSAGE_ALERT',2);
      INSERT INTO resource_color VALUES (2,0x563412);
      INSERT INTO element_property_group VALUES (1,'Element'),(1,'Background'),(1,'Text_Style_600'),(1,'Text_Format');
      INSERT INTO element_property VALUES (1,'Hidden','1'),(2,'Opacity','42'),(3,'Font_Size','0.045'),
        (3,'Font_Name','Courier New'),(3,'Font_Bold','0'),(4,'ScrollSpeed','30'),(3,'Font_Underline','1'),
        (3,'Font_Opacity','0'),(3,'Font_Subscript','1'),(3,'Outline_Enabled','1'),(3,'Outline_Position','2'),
        (3,'Outline_Join','1'),(3,'Outline_Size','0.004'),(3,'Outline_Color','0x123456'),
        (3,'Shadow_Enabled','0'),(3,'Shadow_Angle','-40'),(3,'Shadow_Opacity','85');`)
    data = new Blob([new Uint8Array(db.export())])
  } finally { db.close() }
  const path = 'Default.ewo/Data/FoldbackMessage.Settings.db'
  const result = await readEasyWorshipMessageStyle({ paths: new Map(), read: async () => data }, path)
  expect(result.entry).toEqual({ id: path, output: 'stage', style: {
    enabled: false, position: 'bottom', backgroundColor: '#123456', textColor: '#09090b', opacity: 42,
    fontFamily: 'Courier New', fontRatio: 0.045, bold: false, scrollSpeed: 80,
    effects: { underline: true, baseline: 'sub', fontOpacity: 0,
      outline: { enabled: true, position: 'inner', join: 'square', width: 0.004, color: '#563412' },
      shadow: { enabled: false, angle: -40, opacity: 85 },
    },
  } })
  expect(alertMarqueeDuration(1000, 500, result.entry?.style.scrollSpeed)).toBe(5700)
  expect(alertMarqueeDuration(1000, 500, 0)).toBe(22500)
  expect(alertMarqueeDuration(1000, 500, 100)).toBe(1500)
})

function file(bytes: Uint8Array, path: string): File {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const result = new File([copy], path.split('/').pop() ?? 'file')
  Object.defineProperty(result, 'webkitRelativePath', { value: path })
  return result
}

async function layoutDatabase(): Promise<Uint8Array> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run([
    'CREATE TABLE presentation (presentation_uid TEXT, presentation_type INTEGER, title TEXT, aspect_ratio TEXT, author TEXT, copyright TEXT, description TEXT, looping INTEGER);',
    'CREATE TABLE slide (presentation_id INTEGER, title TEXT, order_index INTEGER, slide_uid TEXT);',
    'CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER, x REAL, y REAL, width REAL, height REAL, background_resource_id INTEGER, foreground_resource_id INTEGER);',
    'CREATE TABLE resource (resource_type INTEGER);',
    'CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);',
    'CREATE TABLE resource_image (resource_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_video (resource_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_color (resource_id INTEGER, color INTEGER);',
    'CREATE TABLE resource_gradient (resource_id INTEGER, angle INTEGER);',
    'CREATE TABLE resource_gradient_color (resource_id INTEGER, color_from INTEGER, color_to INTEGER, percent_from REAL, percent_to REAL);',
    'CREATE TABLE element_property_group (link_id INTEGER);',
    'CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);',
    'CREATE TABLE slide_property_group (link_id INTEGER, group_name TEXT);',
    'CREATE TABLE slide_property (group_id INTEGER, key TEXT, value TEXT);',
    "INSERT INTO presentation(rowid,presentation_uid,presentation_type,title,aspect_ratio) VALUES (1,'song-theme',13,'Song Theme','4:3');",
    "INSERT INTO slide(rowid,presentation_id,title,order_index,slide_uid) VALUES (10,1,'Main',0,'MASTER');",
    "INSERT INTO element(rowid,slide_id,element_uid,order_index,x,y,width,height,foreground_resource_id) VALUES (20,10,'CONTENT_SONG',1,0.1,0.2,0.8,0.6,30);",
    "INSERT INTO element(rowid,slide_id,element_uid,order_index,x,y,width,height,background_resource_id) VALUES (21,10,'BACKGROUND',0,0,0,1,1,31);",
    'INSERT INTO resource_text VALUES (30, \'{\\rtf1\\ansi Placeholder}\');',
    "INSERT INTO resource_image VALUES (31,'<images>sky.jpg');",
    "INSERT INTO slide_property_group(rowid,link_id,group_name) VALUES (42,10,'SlideAdvance');",
    "INSERT INTO slide_property VALUES (42, 'Action', '1'), (42, 'Delay', '5000');",
  ].join('\n'))
  const bytes = db.export()
  db.close()
  return bytes
}

describe('reviewEasyWorshipDesigns', () => {
  it('groups native element shadows across fill and text, with theme inheritance and explicit disable', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    try {
      db.run(`ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
        ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
        INSERT INTO resource_color VALUES (32,0x665544);
        UPDATE element SET background_resource_id=32 WHERE rowid=20;
        INSERT INTO slide(rowid,presentation_id,title,order_index,slide_uid,theme_slide_uid) VALUES (11,1,'Child',1,'CHILD','MASTER');
        INSERT INTO element(rowid,slide_id,element_uid,order_index,x,y,width,height,foreground_resource_id)
          VALUES (30,11,'CONTENT_SONG',1,.1,.2,.8,.6,30);
        INSERT INTO element_property_group VALUES (20,'Shadow'), (30,'Shadow'), (21,'Shadow');
        INSERT INTO element_property VALUES (1,'Enabled','1'), (1,'Radius','20'), (1,'Offset','17'),
          (2,'Color','3351057'), (2,'Opacity','37'), (2,'Angle','450'), (3,'Enabled','1');`)
      const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
      const content = read()
      const [main, child] = content.slides
      const shadow = { group: '20', color: '#000000', opacity: .9, blur: 20 / 1080, offset: 17 / 1080, angle: 315 }
      expect(main.design.layers.find((layer) => layer.id === '21-background')?.elementShadow).toBeUndefined()
      expect(main.design.layers.filter((layer) => layer.id.startsWith('20-')).map((layer) => layer.elementShadow)).toEqual([shadow, shadow])
      expect(child.design.layers.find((layer) => layer.id === '30-foreground')?.elementShadow)
        .toEqual({ ...shadow, group: '30', color: '#112233', opacity: .37, angle: 90 })
      const legacy = easyWorshipDesignIdentityContent(content)
      expect(legacy.slides[0].design.layers.find((layer) => layer.id === '20-foreground')).toMatchObject({ style: { shadow: true } })
      expect(legacy.slides.every((slide) => slide.design.layers.every((layer) => layer.elementShadow === undefined))).toBe(true)
      expect(backfillImportedLayoutDetails(legacy, content).slides).toEqual(content.slides)
      db.run("INSERT INTO element_property VALUES (2,'Enabled','0')")
      expect(read().slides[1].design.layers.find((layer) => layer.id === '30-foreground')?.elementShadow).toBe(false)
    } finally { db.close() }
  })

  it('preserves the previous design identity while restoring a line border and an enabled reflection', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
      INSERT INTO element_property_group VALUES (20,'Border'), (20,'Reflection');
      INSERT INTO element_property VALUES (1,'Style','1'),(1,'Color','0x332211'),(1,'Position','2'),(1,'Join','1'),(1,'Opacity','65'),
        (2,'Enabled','1');`)
    const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    const source = read()
    expect(source.warnings).not.toContain(unsupportedElementReflection)
    expect(source.warnings).not.toContain(legacyElementDecorationWarning)
    const reflection = { group: '20', size: .75, opacity: .5, blur: 0, distance: 0 }
    expect(source.slides[0].design.layers[1].elementReflection).toEqual(reflection)
    expect(source.slides[0].design.layers[1].elementBorder).toEqual({ color: '#112233', opacity: .65, width: 4 / 1080, position: 'inner', join: 'miter' })
    const identity = easyWorshipDesignIdentityContent(source)
    expect(identity.warnings).toContain(legacyElementDecorationWarning)
    const saved = { ...identity, warnings: [unsupportedElementReflection] }
    const restored = backfillImportedLayoutDetails(saved, source)
    expect(restored.slides[0].design.layers[1].elementReflection).toEqual(reflection)
    expect(restored.slides[0].design.layers[1].elementBorder).toEqual(source.slides[0].design.layers[1].elementBorder)
    expect(restored.warnings).toBeUndefined()
    db.run("UPDATE element_property SET value='2' WHERE key='Style'")
    expect(read().warnings).toContain(unsupportedElementBorder)
    db.run("UPDATE element_property SET value='0' WHERE key='Style'")
    expect(read().slides[0].design.layers[1].elementBorder).toBe(false)
    db.close()
  })

  it('inherits the native border and honors an explicit child override', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      INSERT INTO slide(rowid, presentation_id, title, order_index, slide_uid, theme_slide_uid)
        VALUES (11,1,'Child',1,'CHILD','MASTER');
      INSERT INTO element(rowid, slide_id, element_uid, order_index,x,y,width,height,foreground_resource_id)
        VALUES (30,11,'CONTENT_SONG',1,.1,.2,.8,.6,30);
      INSERT INTO element_property_group VALUES (20,'Border'),(30,'Border');
      INSERT INTO element_property VALUES (1,'Style','1'),(1,'Color','255'),(1,'Size','18'),(2,'Opacity','40');`)
    const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    expect(read().slides[1].design.layers.find(({ id }) => id === '30-foreground')?.elementBorder)
      .toEqual({ color: '#ff0000', opacity: .4, width: 18 / 1080, position: 'outer', join: 'round' })
    db.run("INSERT INTO element_property VALUES (2,'Style','0')")
    expect(read().slides[1].design.layers.find(({ id }) => id === '30-foreground')?.elementBorder).toBe(false)
    db.close()
  })

  it('inherits explicit reflection settings and keeps a child disabled', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    try {
      db.run(`ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
        ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
        UPDATE element SET background_resource_id=32 WHERE rowid=20;
        INSERT INTO resource_color VALUES (32,0x123456);
        INSERT INTO slide(rowid, presentation_id, title, order_index, slide_uid, theme_slide_uid)
          VALUES (11,1,'Child',1,'CHILD','MASTER');
        INSERT INTO element(rowid, slide_id, element_uid, order_index,x,y,width,height,foreground_resource_id)
          VALUES (30,11,'CONTENT_SONG',1,.1,.2,.8,.6,30);
        INSERT INTO element_property_group VALUES (20,'Reflection'),(30,'Reflection');
        INSERT INTO element_property VALUES (1,'Enabled','-1'), (1,'Size','40'), (1,'Blur','12'), (2,'Distance','30'), (2,'Opacity','65');`)
      const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
      const parent = { group: '20', size: .4, opacity: .5, blur: 12 / 1080, distance: 0 }
      const content = read()
      expect(content.slides[0].design.layers.filter((layer) => layer.id.startsWith('20-')).map((layer) => layer.elementReflection))
        .toEqual([parent, parent])
      expect(content.slides[1].design.layers.find(({ id }) => id === '30-foreground')?.elementReflection)
        .toEqual({ ...parent, group: '30', opacity: .65, distance: 30 / 1080 })
      db.run("INSERT INTO element_property VALUES (2,'Enabled','0')")
      const disabled = read()
      expect(disabled.slides[1].design.layers.find(({ id }) => id === '30-foreground')?.elementReflection).toBe(false)
      expect(backfillImportedLayoutDetails(disabled, content)).toBe(disabled)
    } finally { db.close() }
  })

  it('restores native rotations of matching frames without changing the import identity or overriding local angles', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
      ALTER TABLE element ADD COLUMN shape_resource_id INTEGER;
      UPDATE element SET shape_resource_id=90 WHERE rowid=20;
      UPDATE element SET background_resource_id=32 WHERE rowid=20;
      INSERT INTO resource_color VALUES (32, 255);
      INSERT INTO element_property_group VALUES (20,'Element'), (21,'Element');`)
    const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    const saved = read()
    db.run(`INSERT INTO element_property VALUES (1,'Rotation','35'),(2,'Rotation','90');`)
    const source = read()
    db.close()
    expect(source.slides[0].design.layers.map(({ rotation }) => rotation)).toEqual([-90, -35, -35])
    expect(easyWorshipDesignIdentityContent(saved)).toEqual(easyWorshipDesignIdentityContent(source))
    const restored = backfillImportedLayoutDetails(saved, source)
    expect(restored.slides).toEqual(source.slides)
    const layers = saved.slides[0].design.layers.map((layer) => layer.id === '20-foreground' ? { ...layer, rotation: 0 }
      : layer.id === '20-background' ? { ...layer, frame: { ...layer.frame, x: .2 } } : layer)
    const local = { ...saved, slides: [{ ...saved.slides[0], design: { ...saved.slides[0].design, layers } }] }
    expect(backfillImportedLayoutDetails(local, source).slides[0].design.layers.map(({ rotation }) => rotation)).toEqual([-90, undefined, 0])
    expect(backfillImportedLayoutDetails(restored, source)).toBe(restored)
  })

  it('keeps a reusable native presentation note under the legacy layout ID and respects explicit clearing', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run('ALTER TABLE presentation ADD COLUMN notes TEXT')
    db.run('UPDATE presentation SET presentation_type=8 WHERE rowid=1')
    const read = () => readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    const before = read()
    const notes = 'เปิดไมค์หลังสไลด์นี้\nรอสัญญาณจากทีมเวที'
    db.run('UPDATE presentation SET notes=? WHERE rowid=1', [notes])
    const after = read()
    expect(after.notes).toBe(notes)
    expect(easyWorshipDesignIdentityContent(before)).toEqual(easyWorshipDesignIdentityContent(after))
    expect(backfillImportedLayoutDetails(before, after).notes).toBe(notes)
    for (const editedNotes of ['', 'โน้ตที่แก้ในคลัง']) {
      const edited = { ...before, notes: editedNotes }
      expect(backfillImportedLayoutDetails(edited, after)).toBe(edited)
    }
    db.close()
  })

  it('keeps a positioned web frame and restores it on re-import without replacing an edited slide', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`
      CREATE TABLE resource_web (resource_id INTEGER, url TEXT, remove_scroll_bars BOOLEAN);
      INSERT INTO resource_web VALUES (35,'https://example.test/announcement',1),(36,'javascript:void(0)',0);
      INSERT INTO element(rowid,slide_id,element_uid,order_index,x,y,width,height,foreground_resource_id)
      VALUES (22,10,'web',2,.15,.22,.4,.5,35),(23,10,'bad-web',3,0,0,1,1,36);
    `)
    const content = readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    db.close()
    const getWeb = (design: typeof content) => design.slides[0].design.layers.filter((layer) => layer.kind === 'web')
    expect(getWeb(content)).toMatchObject([{ url: 'https://example.test/announcement', role: 'foreground', hideScrollbars: true,
      frame: { x: .15, y: .22, width: .4, height: .5 } }])
    const previous = easyWorshipDesignIdentityContent(content)
    expect(getWeb(previous)).toHaveLength(0)
    const refreshed = backfillImportedLayoutDetails(previous, content)
    expect(getWeb(refreshed)).toEqual(getWeb(content))
    const removed = { ...previous, webLayersImported: true } as const
    const removedLayers = removed.slides[0].design.layers
    expect(backfillImportedLayoutDetails(removed, content).slides[0].design.layers)
      .toEqual([{ ...removedLayers[0], role: 'background' }, ...removedLayers.slice(1)])
    const edited = structuredClone(previous)
    edited.slides[0].design.layers[0].frame.x = .222
    const editedLayers = edited.slides[0].design.layers
    expect(backfillImportedLayoutDetails(edited, content).slides[0].design.layers)
      .toEqual([{ ...editedLayers[0], role: 'background' }, ...editedLayers.slice(1)])
  })

  it('preserves native text insets, sizing and mixed alignment while refreshing only unchanged boxes', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    const rtf = String.raw`{\rtf1{\pard\qc\fs48 Thai \u3585?\line Subtitle\par}{\pard\qr\fs48 Right\par}{\pard\ql\fs48 Left\par}}`
    db.run('UPDATE resource_text SET rtf=? WHERE resource_id=30', [rtf])
    db.run(`
      ALTER TABLE element_property_group ADD COLUMN group_name TEXT;
      INSERT INTO element_property_group(rowid,link_id,group_name) VALUES (50,20,'Text_Margins'),(51,20,'Text_Format');
      INSERT INTO element_property VALUES (50,'Left','0.125'),(50,'Right','0'),(50,'Top','0.015625'),
        (50,'Bottom','invalid'),(51,'Auto_Size','1');
    `)
    const content = readEasyWorshipLayouts(db, { resolveAsset: () => ({}) }).entries[0].content
    db.close()
    expect(content.slides[0].design.layers[1]).toMatchObject({
      kind: 'text', text: 'Thai ก\nSubtitle\nRight\nLeft',
      runs: [{ text: 'Thai ก\nSubtitle\n' }, { text: 'Right\n', align: 'right' }, { text: 'Left', align: 'left' }],
      textLayout: { insets: { left: 0.125, right: 0, top: 0.015625 }, sizing: 'fit' },
    })
    const previous = easyWorshipDesignIdentityContent(content)
    expect(previous.slides[0].design.layers[1]).not.toHaveProperty('textLayout')
    expect(previous.slides[0].design.layers[1]).not.toHaveProperty('runs')
    const refreshed = backfillImportedLayoutDetails(previous, content)
    expect(refreshed.slides[0].design.layers[1]).toEqual(content.slides[0].design.layers[1])
    expect(backfillImportedLayoutDetails(refreshed, content)).toBe(refreshed)
    const edited = structuredClone(previous)
    const layer = edited.slides[0].design.layers[1]
    if (layer.kind === 'text') layer.text = 'ปรับเองแล้ว'
    expect(backfillImportedLayoutDetails(edited, content).slides[0].design.layers)
      .toEqual([{ ...edited.slides[0].design.layers[0], role: 'background' }, layer])
  })

  it('keeps a video layer’s native clip marks without changing the earlier design identity', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`
      ALTER TABLE resource_video ADD COLUMN start_pos INTEGER;
      ALTER TABLE resource_video ADD COLUMN end_pos INTEGER;
      INSERT INTO resource_video VALUES (32,'<videos>loop.mp4',-1,-1);
      UPDATE element SET background_resource_id=32 WHERE rowid=21;
    `)
    const options = { resolveAsset: () => ({ sourcePath: 'Default/Resources/Videos/loop.mp4' }) }
    const before = readEasyWorshipLayouts(db, options).entries[0].content
    db.run('UPDATE resource_video SET start_pos=12000000,end_pos=42500000 WHERE resource_id=32')
    const after = readEasyWorshipLayouts(db, options).entries[0].content
    db.close()
    expect(after.slides[0].design.layers[0]).toMatchObject({ kind: 'media', asset: { clip: { startSeconds: 1.2, endSeconds: 4.25 } } })
    expect(easyWorshipDesignIdentityContent(after)).toEqual(easyWorshipDesignIdentityContent(before))
  })

  it('inherits transition values from the referenced layout and preserves the previous design identity', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`
      ALTER TABLE slide ADD COLUMN theme_id INTEGER;
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      INSERT INTO presentation(rowid,presentation_type,title,aspect_ratio) VALUES (2,8,'Welcome','16:9'), (3,12,'Theme','16:9');
      INSERT INTO slide(rowid,presentation_id,order_index,slide_uid,theme_id,theme_slide_uid)
      VALUES (12,2,0,'opening',3,'TITLE'), (13,3,0,'MASTER',NULL,NULL), (14,3,1,'TITLE',NULL,'MASTER');
      INSERT INTO slide_property_group(rowid,link_id,group_name) VALUES
        (43,13,'TransitionIn'), (44,12,'TransitionIn'), (45,13,'SlideAdvance'), (46,12,'SlideAdvance');
      INSERT INTO slide_property VALUES (43,'UID','sdDXCover'), (43,'Duration','750'), (43,'Value-Direction','3'),
        (44,'Duration','1200'), (44,'Value-FadeIn','1'), (44,'AlwaysReset','1'),
        (45,'Action','1'), (45,'Delay','5000'), (45,'Looping','1'), (46,'Action','2'), (46,'Looping','0');
    `)
    const { entries: [source] } = readEasyWorshipLayouts(db, { resolveAsset: () => ({}), schedule: true })
    db.close()
    expect(source.content.slides[0].transition).toEqual({
      uid: 'sdDXCover', values: { Duration: '1200', 'Value-Direction': '3', 'Value-FadeIn': '1', AlwaysReset: '1' },
    })
    expect(source.content.slides[0].playback).toEqual({ mode: 'media', delayMs: 5000, loop: false, restart: true })
    const legacy = easyWorshipDesignIdentityContent(source.content, source.legacyTransitionWarningAt)
    expect(legacy.slides[0]).not.toHaveProperty('transition')
    expect(legacy.slides[0]).not.toHaveProperty('playback')
    expect(legacy.warnings).toEqual(['เก็บเวลาเลื่อนสไลด์ได้ ส่วนเอฟเฟ็กต์เปลี่ยนฉากยังไม่รองรับ'])
    const original = { ...legacy, source: { format: 'easyworship' as const, uid: 'layout' } }
    const imported = { ...source.content, source: original.source }
    const renamed = { ...original, slides: [{ ...original.slides[0], label: 'Local label' }] }
    const restored = backfillImportedLayoutDetails(renamed, imported)
    expect(restored.slides[0]).toMatchObject({ label: 'Local label', transition: imported.slides[0].transition,
      playback: imported.slides[0].playback })
    expect(restored.warnings).toBeUndefined()
    expect(backfillImportedLayoutDetails(restored, imported)).toBe(restored)
    expect(easyWorshipDesignIdentityContent(restored, 0)).toEqual(easyWorshipDesignIdentityContent({
      ...imported, slides: [{ ...imported.slides[0], label: renamed.slides[0].label }],
    }, 0))
  })

  it('backfills playback by a unique native slide ID while keeping the operator choices', () => {
    const design = { aspectRatio: 16 / 9, layers: [] }
    const transition = { uid: 'sdDXCover', values: { Duration: '750' } }
    const source = { format: 'easyworship' as const, uid: 'design' }
    const imported = { source, slides: ['first', 'second', 'third'].map((id) => ({ id, label: id, design,
      transition, advanceMs: 5000, playback: { mode: 'timer' as const, delayMs: 5000 } })) }
    const first = { id: 'first', label: 'Local title', design }
    const second = { id: 'second', label: 'Second', design, transitionEdited: true as const, playback: { mode: 'manual' as const } }
    const third = { id: 'third', label: 'Third', design, advanceMs: 9000 }
    const extra = { id: 'local', label: 'New slide', design }
    const saved = { source, slides: [third, second, extra, first] }
    expect(backfillImportedLayoutDetails(saved, imported).slides).toEqual([
      { ...third, transition }, second, extra, { ...imported.slides[0], label: first.label },
    ])
    const duplicated = { source, slides: [first, first] }
    expect(backfillImportedLayoutDetails(duplicated, imported)).toBe(duplicated)
    expect(backfillImportedLayoutDetails(saved, { ...imported, source: { ...source, uid: 'other' } })).toBe(saved)
  })

  it('preserves native text roles, including theme placeholders with no resource text', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    db.run(`
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      INSERT INTO presentation(rowid,presentation_type,title) VALUES (2,8,'Welcome'), (3,12,'Broadcast');
      INSERT INTO slide(rowid,presentation_id,order_index,slide_uid,theme_slide_uid)
      VALUES (12,2,0,'source-title','TITLE'), (13,3,0,'TITLE','MASTER'), (14,3,1,'CONTENT','MASTER');
      INSERT INTO element(slide_id,element_uid,order_index,x,y,width,height,foreground_resource_id) VALUES
        (12,'TITLE',0,0.1,0.2,0.8,0.2,30), (13,'TITLE',0,0.1,0.7,0.8,0.1,NULL),
        (13,'SUBTITLE',1,0.1,0.8,0.8,0.05,NULL), (14,'CONTENT_PRESENTATION',0,0.1,0.8,0.8,0.2,NULL);
    `)
    const { entries } = readEasyWorshipLayouts(db, { resolveAsset: () => ({}) })
    db.close()
    const [, source, theme] = entries
    const cue = presentationCue({ ...source, id: 'source', created_at: '' })
    expect(cue.slides[0]).toMatchObject({
      template: 'TITLE',
      design: { layers: [{ text: 'Placeholder', presentationField: 'title' }] },
    })
    expect(theme.content.slides[0].design.layers).toMatchObject([
      { kind: 'text', text: '', presentationField: 'title', frame: { y: 0.7 } },
      { kind: 'text', text: '', presentationField: 'subtitle', frame: { y: 0.8 } },
    ])
    const [legacyTitle, legacyContent] = easyWorshipDesignIdentityContent(theme.content).slides
    expect(legacyTitle.design.layers).toEqual([])
    expect(legacyContent.design.layers).toMatchObject([{ kind: 'text', text: '', slot: 'content' }])
    expect(legacyContent.design.layers[0]).not.toHaveProperty('presentationField')
  })

  it('maps verified song placeholders, normalized geometry, and exact same-profile image paths', async () => {
    const result = await reviewEasyWorshipDesigns([
      file(await layoutDatabase(), 'Default/v6.1/Databases/Data/PresentationLayouts.db'),
      file(new TextEncoder().encode('image'), 'Default/Resources/Images/sky.jpg'),
    ])
    const slide = result.entries?.[0].content.slides[0]
    expect(result.entries?.[0].kind).toBe('song-theme')
    expect(slide).toMatchObject({ template: 'MASTER', advanceMs: 5000, design: { aspectRatio: 4 / 3 } })
    expect(slide?.design.layers).toMatchObject([
      { kind: 'media', asset: { kind: 'image', filename: 'sky.jpg', sourcePath: 'Default/Resources/Images/sky.jpg' } },
      { kind: 'text', text: 'Placeholder', slot: 'content', frame: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 } },
    ])
    const asset = await result.readAsset?.('Default/Resources/Images/sky.jpg')
    expect(asset?.size).toBeGreaterThan(0)
  })

  it('keeps same-name layout media versions separate and leaves a mismatch available for recovery', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await layoutDatabase())
    const first = new Uint8Array([1, 2, 3, 4])
    const second = new Uint8Array([3, 4, 2, 1])
    const decoy = new Uint8Array([4, 3, 2, 1])
    const [firstHash, secondHash] = await Promise.all([first, second].map((bytes) => mediaFileHash(new Blob([bytes]))))
    db.run(`CREATE TABLE file (filename TEXT, file_hash TEXT);
      ALTER TABLE resource_image ADD COLUMN file_id INTEGER;
      ALTER TABLE resource_image ADD COLUMN filesize INTEGER;
      UPDATE resource_image SET file_id=1, filesize=4 WHERE resource_id=31;
      INSERT INTO resource_image VALUES(32,'<images>sky.jpg',2,4);
      INSERT INTO element(slide_id,element_uid,order_index,x,y,width,height,foreground_resource_id)
        VALUES (10,'IMAGE',3,.5,.5,.3,.3,32);`)
    db.run("INSERT INTO file VALUES ('sky.jpg',?), ('sky.jpg',?)", [firstHash, secondHash.toUpperCase()])
    const catalog = file(db.export(), 'Default/v6.1/Databases/Archive/2025-01-01 7.4/PresentationLayouts.db')
    db.close()
    const sources = [
      catalog,
      file(decoy, 'Default/Resources/Images/sky.jpg'),
      file(first, 'Default/Resources/Images/Renamed.jpg'),
      file(second, 'Another/Resources/Images/sky.jpg'),
    ]
    const firstReview = await reviewEasyWorshipDesigns(sources)
    const layers = firstReview.entries?.[0].content.slides[0].design.layers.filter((layer) => layer.kind === 'media')
    expect(layers?.map(({ asset }) => [asset.filename, asset.sourcePath])).toEqual([
      ['sky.jpg', 'Default/Resources/Images/Renamed.jpg'], ['sky.jpg', undefined],
    ])
    const attached = new File([second], 'Original elsewhere.jpg')
    const after = await reviewEasyWorshipProfile(sources, undefined, undefined, undefined, [attached])
    const restored = after.review?.designs?.entries?.[0].content.slides[0].design.layers.filter((layer) => layer.kind === 'media')
    expect(restored?.[1].asset.sourcePath).toBe('@attached-media/0/Original elsewhere.jpg')
    const content = await after.review?.designs?.readAsset?.('@attached-media/0/Original elsewhere.jpg')
    expect(content && await mediaFileHash(content)).toBe(secondHash)
    expect(easyWorshipDesignIdentityContent(after.review!.designs!.entries![0].content))
      .toEqual(easyWorshipDesignIdentityContent(firstReview.entries![0].content))

    const native = new Uint8Array(await catalog.arrayBuffer())
    const current = await reviewEasyWorshipProfile([
      file(native, 'Default/v6.1/Databases/Data/PresentationLayouts.db'),
      file(native, 'Default/v6.1/Options/Default.ewo/Data/Live.Settings.db'),
      ...sources.slice(1),
    ])
    const theme = current.review?.defaultThemes.find(({ slot }) => slot === 'live:song')
    expect(theme?.content.slides[0].design.layers[0]).toMatchObject({
      kind: 'media', asset: { sourcePath: 'Default/Resources/Images/Renamed.jpg' },
    })
  })

  it('finds an aliased PowerPoint in the same Windows-style profile and reports ambiguous copies', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run(`
      CREATE TABLE file_item (file_item_uid TEXT, presentation_id INTEGER, title TEXT, filename TEXT, alias_filename TEXT, author TEXT);
      INSERT INTO file_item VALUES ('pptx-record', NULL, 'Sunday service', 'Original.pptx', 'Stored.pptx', 'Team');
    `)
    const catalog = file(db.export(), 'Default/Databases/Data/Presentations.db')
    db.close()
    const png = new Uint8Array([1, 2, 3])
    const matching = file(png, 'Default/Resources/Presentations/Stored.pptx')
    const outside = file(png, 'Other/Resources/Presentations/Stored.pptx')
    const reviewed = await reviewEasyWorshipDesigns([catalog, matching, outside])

    expect(reviewed.entries).toEqual([])
    expect(reviewed.powerPoints).toMatchObject([{
      id: 'pptx-record', title: 'Sunday service', filename: 'Stored.pptx', author: 'Team',
      collectionDetails: { filename: 'Original.pptx' },
      sourcePath: 'Default/Resources/Presentations/Stored.pptx',
    }])
    const duplicate = file(png, 'Default/Resources/Another/Stored.pptx')
    const ambiguous = await reviewEasyWorshipDesigns([catalog, matching, duplicate])
    expect(ambiguous.powerPoints?.[0].sourcePath).toBeUndefined()
    expect(ambiguous.powerPoints?.[0].warning).toBeTruthy()
  })

  it('recovers the two versions recorded under the same PowerPoint name without using a wrong namesake', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    const first = new Uint8Array([1, 2, 3, 4])
    const second = new Uint8Array([3, 4, 2, 1])
    const replacement = new Uint8Array([4, 3, 2, 1])
    const [firstHash, secondHash] = await Promise.all([first, second].map((bytes) => mediaFileHash(new Blob([bytes]))))
    db.run(`CREATE TABLE file_item (
      file_item_uid TEXT, presentation_id INTEGER, title TEXT, filename TEXT, alias_filename TEXT,
      source_filename TEXT, file_hash TEXT, filesize INTEGER, source_file_hash TEXT
    )`)
    const add = (values: (string | number | null)[]) => db.run('INSERT INTO file_item VALUES (?,null,?,?,?,?,?,?,?)', values)
    add(['first', 'First edition', 'Sunday.pptx', 'Stored.pptx', null, firstHash.toUpperCase(), first.length + 17, null])
    add(['second', 'Second edition', 'Sunday.pptx', 'Stored.pptx', 'Original name.pptx', '0'.repeat(64), second.length, secondHash])
    const catalog = file(db.export(), 'Default/v6.1/Databases/Archive/2025-01-01 7.4/Presentations.db')
    db.close()
    const inputs = [
      catalog,
      file(first, 'Default/Resources/Presentations/Renamed first.pptx'),
      file(replacement, 'Default/Resources/Presentations/Stored.pptx'),
      file(second, 'Other/Resources/Presentations/Original name.pptx'),
    ]
    const before = await reviewEasyWorshipDesigns(inputs)
    expect(before.profiles[0].name).toBe('Default · ฐานข้อมูลย้อนหลัง 2025-01-01 7.4')
    expect(before.powerPoints).toMatchObject([
      { id: 'first', filename: 'Renamed first.pptx', sourcePath: 'Default/Resources/Presentations/Renamed first.pptx',
        fileChecks: [{ filenames: ['Sunday.pptx', 'Stored.pptx'], hash: firstHash }] },
      { id: 'second', warning: 'ไม่พบไฟล์ PowerPoint ที่ตรงกับ SHA-256 ใน Presentations.db กรุณาแนบไฟล์เดิม',
        fileChecks: [{ filenames: ['Sunday.pptx', 'Stored.pptx'], hash: '0'.repeat(64) },
          { filenames: ['Original name.pptx'], hash: secondHash }] },
    ])
    expect(before.powerPoints?.[1].sourcePath).toBeUndefined()
    const after = await reviewEasyWorshipProfile(inputs, undefined, undefined, undefined, [new File([second], 'Renamed second.pptx')])
    expect(after.review?.designs?.powerPoints?.[1]).toMatchObject({
      id: 'second', filename: 'Renamed second.pptx', originalFilename: 'Original name.pptx', sourcePath: '@attached-media/0/Renamed second.pptx',
    })
    const saved = await after.review?.designs?.readAsset?.('@attached-media/0/Renamed second.pptx')
    expect(saved && await mediaFileHash(saved)).toBe(secondHash)
  })

  it('keeps the original design hash and upgrades collection metadata without replacing slides', () => {
    const source = { format: 'easyworship' as const, uid: 'native', author: 'Original' }
    const old = { source, slides: [{ id: '1', label: 'Local edit', design: { aspectRatio: 1, layers: [] } }] }
    const incoming = { ...old, source: { ...source, collectionDetails: { tags: 'Advent' } } }
    expect(easyWorshipDesignIdentityContent(incoming)).toEqual(easyWorshipDesignIdentityContent(old))
    const saved = backfillImportedCollectionDetails(old, { ...incoming, slides: [] })
    expect(saved.source?.collectionDetails).toEqual({ tags: 'Advent' })
    expect(saved.slides).toBe(old.slides)
    expect(backfillImportedCollectionDetails(saved, incoming)).toBe(saved)
    const powerPoint = { ...old, source: { format: 'powerpoint' as const, uid: 'same-file', collectionDetails: { filename: 'Local.pptx' } } }
    const importedPowerPoint = { ...powerPoint, source: { ...powerPoint.source, catalogUid: 'native-record',
      collectionDetails: { filename: 'Catalog.pptx', folder: 'Slides' } } }
    expect(backfillImportedCollectionDetails(powerPoint, importedPowerPoint).source).toMatchObject({
      catalogUid: 'native-record', collectionDetails: { filename: 'Catalog.pptx', folder: 'Slides' },
    })
  })
})
