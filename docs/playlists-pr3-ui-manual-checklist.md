# Manual UI checklist — Playlists PR3.1 (Add from Аудиотека)
#
# Mobile shell 390–430 px. Do not deploy/apply migration to production for this check
# unless separately approved; prefer local/preview after migration on test DB.
#
# [ ] Open /my-practices while signed in
# [ ] Card ··· menu is enabled for available practices
# [ ] «Добавить в плейлист» opens bottom sheet
# [ ] Loading state shows while membership loads
# [ ] Checked boxes match existing membership
# [ ] Select multiple playlists
# [ ] Uncheck a playlist
# [ ] Public playlist for non-free product: checkbox disabled + hint
# [ ] «Новый плейлист» opens inline private create form
# [ ] Created playlist appears checked; sheet stays open
# [ ] Save success closes sheet and shows «Плейлисты обновлены.»
# [ ] Save error keeps sheet open and preserves selection
# [ ] Empty state copy + «Создать плейлист»
# [ ] Load error + «Повторить»
# [ ] Escape closes sheet
# [ ] Backdrop click closes sheet
# [ ] Duplicate Save while in-flight is blocked
# [ ] No horizontal scroll; safe-area padding at bottom
