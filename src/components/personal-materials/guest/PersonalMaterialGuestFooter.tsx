export default function PersonalMaterialGuestFooter() {
  return (
    <footer className="space-y-3 border-t border-[#ece6f5] pt-6 text-center">
      <p className="text-sm leading-6 text-[#6d628f]">
        Этот персональный материал доступен только по вашей ссылке.
        <br />
        Не пересылайте её другим людям.
      </p>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#7042c5]">АудиоЛад</p>
        <p className="text-xs text-[#9a91b8]">
          Персональное пространство для аудиопрактик и материалов
        </p>
      </div>
    </footer>
  );
}
