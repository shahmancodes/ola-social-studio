type OlaLogoProps = {
  className?: string;
  decorative?: boolean;
  writeIn?: boolean;
};

export function OlaLogo({ className, decorative = false, writeIn = false }: OlaLogoProps) {
  return <img
    className={className}
    src={writeIn ? "/ola-logo-flow.svg" : "/ola-logo-flow-loop.svg"}
    alt={decorative ? "" : "ola"}
    aria-hidden={decorative || undefined}
    width="292"
    height="202"
  />;
}
