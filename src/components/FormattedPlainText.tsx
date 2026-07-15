type FormattedPlainTextProps = {
  text: string;
  className?: string;
  as?: "p" | "span" | "div";
};

export default function FormattedPlainText({
  text,
  className,
  as: Component = "p",
}: FormattedPlainTextProps) {
  const classes = className
    ? `whitespace-pre-line ${className}`
    : "whitespace-pre-line";

  return <Component className={classes}>{text}</Component>;
}
