BEGIN READ ONLY;
\pset fieldsep '\t'
\pset null ''
SELECT au.name, p.id, p.title, p.status, p.published_at::date, p.product_kind, p.music_usage_permission, p.publication_class, p.catalog_section, p.is_catalog_listed,
 ai.music_track_code, ai.id, ai.title, ai.status, ai.duration_seconds, ai.created_at::date, ai.position, ai.original_file_name,
 (SELECT count(*) FROM music_passport_versions v WHERE v.audio_item_id=ai.id AND v.status='active') pass,
 (SELECT string_agg(g.rights_layer||':'||g.use_type||':'||g.status||':'||g.source_type||':'||coalesce(g.verified_at::date::text,''), ',' ORDER BY g.rights_layer,g.use_type) FROM music_rights_grants g WHERE g.audio_item_id=ai.id) grants
FROM audio_items ai JOIN practices p ON p.id=ai.practice_id JOIN authors au ON au.id=p.author_id
WHERE au.id IN ('0a847461-a429-4868-986a-59d7bf2fdb2b','59c7e5b8-eae4-4394-82fb-b815a10be6c2')
ORDER BY au.name, p.published_at NULLS LAST, p.title, ai.position, ai.music_track_code;
SELECT 'RH', id, display_name, entity_type, status, created_at::date FROM music_rightsholders;
SELECT 'GSUM', au.name, g.rights_layer, g.use_type, g.status, g.source_type, g.territory_scope, g.valid_from::date, g.valid_until::date, left(coalesce(g.source_reference,''),120), count(*)
 FROM music_rights_grants g JOIN audio_items ai ON ai.id=g.audio_item_id JOIN practices p ON p.id=ai.practice_id JOIN authors au ON au.id=p.author_id GROUP BY 2,3,4,5,6,7,8,9,10;
SELECT 'PDESC', au.name, p.title, left(regexp_replace(coalesce(p.description,''),'\s+',' ','g'),300) FROM practices p JOIN authors au ON au.id=p.author_id WHERE au.id IN ('0a847461-a429-4868-986a-59d7bf2fdb2b','59c7e5b8-eae4-4394-82fb-b815a10be6c2') AND p.description ~* '(suno|udio|ии|нейросет|ai|искусствен|distrokid|isrc|upc|spotify|яндекс)';
ROLLBACK;
