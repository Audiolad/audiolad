BEGIN READ ONLY;
\pset fieldsep '\t'
SELECT p.id, au.name, p.title, (p.description ~* 'без слов|без голоса|инструментальн') instr, (p.description ~* 'вокал|голос[^а]|поёт|песн') vocal, p.created_at::date
FROM practices p JOIN authors au ON au.id=p.author_id WHERE au.id IN ('0a847461-a429-4868-986a-59d7bf2fdb2b','59c7e5b8-eae4-4394-82fb-b815a10be6c2') ORDER BY 2, p.published_at;
ROLLBACK;
