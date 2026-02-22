import React, { useState, useRef, useEffect } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

export type TooltipProps = {
    content: React.ReactNode;
    children: ReactElement;
    className?: string;
    delay?: number;
};

type TooltipTriggerProps = {
    onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
    ref?: React.Ref<HTMLElement>;
};

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    className,
    delay = 200,
}) => {
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showTooltip = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 8,
                left: rect.left + rect.width / 2,
            });
        }
        setVisible(true);
    };

    const handleMouseEnter = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(showTooltip, delay);
    };

    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const trigger = children as React.ReactElement<TooltipTriggerProps>;

    return (
        <>
            {React.cloneElement(trigger, {
                ref: triggerRef,
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                    handleMouseEnter();
                    trigger.props.onMouseEnter?.(e);
                },
                onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
                    handleMouseLeave();
                    trigger.props.onMouseLeave?.(e);
                },
            })}
            {visible &&
                createPortal(
                    <div
                        className={clsx(
                            'fixed z-[9999] px-2 py-1 text-[10px] text-neutral-200 bg-neutral-800 border border-neutral-700 rounded shadow-lg pointer-events-none -translate-x-1/2 max-w-[200px] whitespace-normal leading-relaxed',
                            className
                        )}
                        style={{ top: coords.top, left: coords.left }}
                    >
                        {content}
                    </div>,
                    document.body
                )}
        </>
    );
};
