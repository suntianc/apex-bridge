/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Anthropic风格色彩方案 - 参考 https://www.anthropic.com/
        // 背景色：奶油色/米白色 (#F8F7F4)
        cream: {
          50: '#F8F7F4',  // 主背景
          100: '#EBE8E2', // 次要背景区域
          200: '#DDD9D1',
        },
        // 强调色：柔和的橙色/赤褐色 (#E08260)
        accent: {
          50: '#FFF5F0',
          100: '#FFE8DC',
          200: '#FFD5C2',
          300: '#FFBDA3',
          400: '#E08260',  // 主强调色
          500: '#C96F4E',
          600: '#B05C3D',
          700: '#97492C',
          800: '#7E361B',
          900: '#65230A',
        },
        // 文字颜色：深灰色/黑色
        text: {
          primary: '#1A1A1A',    // 主标题
          secondary: '#4A4A4A',  // 正文
          tertiary: '#8A8A8A',   // 次要文本
          light: '#B8B8B8',      // 占位符
        },
        // 保留灰色系用于边界和辅助元素
        gray: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#E8E8E8',  // 边框
          300: '#D1D1D1',
          400: '#9A9A9A',
          500: '#6B6B6B',
          600: '#4A4A4A',
          700: '#333333',
          800: '#1A1A1A',
          900: '#0F0F0F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.6' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg': ['18px', { lineHeight: '1.6' }],
        'xl': ['20px', { lineHeight: '1.5' }],
        '2xl': ['24px', { lineHeight: '1.4' }],
        '3xl': ['32px', { lineHeight: '1.3' }],
        '4xl': ['40px', { lineHeight: '1.2' }],
        '5xl': ['48px', { lineHeight: '1.1' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'none': 'none',
        'soft': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'sm': '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'DEFAULT': '0 2px 4px 0 rgba(0, 0, 0, 0.06), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      letterSpacing: {
        'tight': '-0.01em',
        'normal': '0',
        'wide': '0.01em',
      },
    },
  },
  plugins: [],
}

