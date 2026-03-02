import "./ExcalidrawLogo.scss";
import logoPng from "./akylly_tagta_logo.png";

type LogoSize = "xs" | "small" | "normal" | "large" | "custom" | "mobile";

interface LogoProps {
  size?: LogoSize;
  withText?: boolean;
  style?: React.CSSProperties;
  /**
   * If true, the logo will not be wrapped in a Link component.
   * The link prop will be ignored as well.
   * It will merely be a plain div.
   */
  isNotLink?: boolean;
}

export const ExcalidrawLogo = ({ style, size = "small" }: LogoProps) => {
  return (
    <div className={`ExcalidrawLogo is-${size}`} style={style}>
      <img className="ExcalidrawLogo-text" src={logoPng} alt="Akylly Tagta" />
    </div>
  );
};
