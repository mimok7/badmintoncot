import React from 'react';

interface BadmintonIconProps {
    className?: string;
    strokeWidth?: number;
}

export const BadmintonRacket: React.FC<BadmintonIconProps> = ({ className = '', strokeWidth = 2 }) => {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {/* 라켓 헤드 (타원형) */}
            <ellipse cx="12" cy="8" rx="5" ry="6" />
            {/* 라켓 줄 (그물망) */}
            <line x1="12" y1="2" x2="12" y2="14" />
            <line x1="9" y1="5" x2="15" y2="5" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="9" y1="11" x2="15" y2="11" />
            {/* 라켓 손잡이 */}
            <rect x="11" y="14" width="2" height="8" rx="1" />
            <rect x="10.5" y="21" width="3" height="1.5" rx="0.5" />
        </svg>
    );
};

export const Shuttlecock: React.FC<BadmintonIconProps> = ({ className = '', strokeWidth = 2 }) => {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {/* 셔틀콕 헤드 (반구) */}
            <circle cx="12" cy="18" r="3" fill="currentColor" opacity="0.2" />
            <path d="M 9 18 Q 9 16 12 16 Q 15 16 15 18" />
            {/* 깃털 부분 */}
            <path d="M 10 16 L 8 6 L 10 6 Z" />
            <path d="M 12 15.5 L 12 4 L 13 4 L 13 15.5 Z" />
            <path d="M 14 16 L 16 6 L 14 6 Z" />
            {/* 상단 링 */}
            <ellipse cx="12" cy="5" rx="4" ry="1" />
        </svg>
    );
};

export const BadmintonIcon: React.FC<BadmintonIconProps> = ({ className = '', strokeWidth = 2 }) => {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {/* 라켓 1 (좌측) */}
            <ellipse cx="7" cy="7" rx="3.5" ry="4" transform="rotate(-15 7 7)" />
            <line x1="8.5" y1="10" x2="10" y2="13" />
            
            {/* 셔틀콕 (중앙) */}
            <circle cx="14" cy="16" r="2" fill="currentColor" opacity="0.3" />
            <path d="M 12.5 16 L 11 10 L 12.5 10 Z" />
            <path d="M 14 15.5 L 14 9 L 14.5 9 L 14.5 15.5 Z" />
            <path d="M 15.5 16 L 17 10 L 15.5 10 Z" />
            
            {/* 라켓 2 (우측) */}
            <ellipse cx="17" cy="7" rx="3.5" ry="4" transform="rotate(15 17 7)" />
            <line x1="15.5" y1="10" x2="14" y2="13" />
        </svg>
    );
};
