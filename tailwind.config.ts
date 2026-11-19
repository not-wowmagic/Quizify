import type {Config} from 'tailwindcss';

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        body: ['"Avenir Next"', '"Segoe UI Variable"', '"Segoe UI"', 'sans-serif'],
        

      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        palette: {
          blue: 'hsl(var(--palette-blue) / <alpha-value>)',
          purple: 'hsl(var(--palette-purple) / <alpha-value>)',
          orange: 'hsl(var(--palette-orange) / <alpha-value>)',
          green: 'hsl(var(--palette-green) / <alpha-value>)',
          red: 'hsl(var(--palette-red) / <alpha-value>)',
          cyan: 'hsl(var(--palette-cyan) / <alpha-value>)',
          yellow: 'hsl(var(--palette-yellow) / <alpha-value>)',
          warning: 'hsl(var(--palette-warning) / <alpha-value>)',
        },
        on: {
          blue: 'hsl(var(--on-blue))',
          purple: 'hsl(var(--on-purple))',
          orange: 'hsl(var(--on-orange))',
          green: 'hsl(var(--on-green))',
          red: 'hsl(var(--on-red))',
          cyan: 'hsl(var(--on-cyan))',
          yellow: 'hsl(var(--on-yellow))',
          warning: 'hsl(var(--on-warning))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        link: 'hsl(var(--link))',


      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },

    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
