/**
 * Marka logosu — "Ödev Takip".
 * Bu bir marka görselidir; tasarım token'larına tabi değildir (kendi renklerini
 * taşır). Boyut/kırpma `className` ile çağıran taraftan verilir.
 */

import logo from '../assets/logo.png';

export default function BrandLogo({ className = '' }: { className?: string }) {
  return <img src={logo} alt="Ödev Takip" className={className} />;
}
