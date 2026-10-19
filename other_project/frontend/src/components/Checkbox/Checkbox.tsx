import { CSSProperties, FunctionComponent } from 'react';
import styles from './Checkbox.module.css';

interface CheckboxProps {
    checked: boolean;
    onChange: (standardType: string, isChecked: boolean) => void;
    label?: string | undefined;
    svgImage?: string | undefined;
    style?: CSSProperties | undefined;
    horizontal?: boolean;
    id?: string;
}

const Checkbox: FunctionComponent<CheckboxProps> = ({ checked, onChange, label, svgImage, style, horizontal, id }) => {
    return (
        <label className={`${styles.checkboxWrapper} ${horizontal ? styles.horizontal : styles.vertical}`}>
            <input type="checkbox" checked={checked} style={style} id={id} onChange={(e) => onChange('', e.target.checked)} />
            {label}
        </label>
    );
};

export default Checkbox;
