type PersonalMaterialClientErrorAlertProps = {
  message: string;
  className?: string;
};

export function PersonalMaterialClientErrorAlert({
  message,
  className = "mt-3",
}: PersonalMaterialClientErrorAlertProps) {
  return (
    <div className={className} role="alert">
      <p className="text-sm text-[#b42318]">{message}</p>
    </div>
  );
}
