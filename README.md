# Port Manager - DevTools

> A cross-platform desktop developer utility for managing network ports and viewing system information.

Port Manager is a [Tauri v2](https://v2.tauri.app/) desktop application that helps developers quickly identify and terminate processes occupying network ports during local development. It also provides a real-time system information viewer for hardware and OS details.

## Features

### Port Management

- **Flexible Port Input** - Support multiple input formats:
  - Single port: `3000`
  - Port range: `3000-4000`
  - Comma-separated: `3000,8080,9000`
  - Mixed format: `3000,8080,9000-9010`
- **Common Port Quick-Add** - One-click buttons for frequently used ports (3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000)
- **Live Port Preview** - Visual tag display showing parsed ports as grouped ranges (e.g. `3000`, `5173`, `8080-9000`)
- **Detailed Results** - Color-coded success/failure status per port with process information
- **Keyboard Shortcut Support** - Press `Enter` to submit

### System Information

- **Native Mode** (Tauri) - Full hardware and OS details via Rust backend:
  - Operating system name and version
  - Kernel version
  - Hostname
  - CPU brand and core count
  - Memory statistics (total, available, used, usage percentage)
- **Browser Fallback Mode** - When running outside Tauri, displays:
  - Browser name and version (Firefox, Chrome, Safari, Edge)
  - Platform detection
  - System language
  - Screen resolution
- **Refresh & Retry** - Refresh data on demand or retry on error

### Internationalization

Full support for **English** and **Simplified Chinese** with a built-in language switcher in the header bar. UI language can be changed instantly without restarting the application.

### Cross-Platform

Runs on **macOS**, **Windows**, and **Linux** with platform-native behavior.

## Technology Stack

| Layer       | Technology                                                                 |
| ----------- | -------------------------------------------------------------------------- |
| Desktop FW  | [Tauri v2](https://v2.tauri.app/)                                         |
| Frontend    | [React 18](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| Bundler     | [Vite 6](https://vitejs.dev/)                                             |
| Backend     | [Rust](https://www.rust-lang.org/) (edition 2021)                         |
| i18n        | [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) |
| CI/CD       | GitHub Actions (4 build targets + automated releases)                     |

## Screenshots

| Port Manager | System Info |
| :----------: | :---------: |
| ![Port Manager](https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Developer+desktop+app+showing+port+management+interface+with+input+field+common+port+buttons+and+kill+button+on+a+light+modern+macOS+like+UI&image_size=landscape_4_3) | ![System Info](https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Developer+desktop+app+showing+system+information+panel+with+OS+name+CPU+memory+usage+on+a+light+modern+macOS+like+UI&image_size=landscape_4_3) |

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or later (recommended: v22)
- **Rust** (latest stable) - [Install via rustup](https://rustup.rs/)
- **System dependencies** (platform-specific):

<details>
<summary><b>macOS</b></summary>

No additional dependencies required. Xcode Command Line Tools are recommended:

```bash
xcode-select --install
```
</details>

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev
```
</details>

<details>
<summary><b>Windows</b></summary>

- Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (pre-installed on Windows 10 version 1803+)
</details>

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/port-manager.git
cd port-manager

# Install frontend dependencies
npm install
```

### Development

Run the app in development mode with hot module replacement:

```bash
npm run tauri:dev
```

This will start the Vite dev server on `http://localhost:1420` and launch the Tauri desktop window.

### Build for Production

```bash
# Build the Tauri desktop application for the current platform
npm run tauri build
```

The packaged installers will be available in `src-tauri/target/release/bundle/`:
- **macOS**: `.dmg`
- **Windows**: `.msi` / `.exe`
- **Linux**: `.deb` / `.AppImage`

## Usage Guide

### Killing Port Processes

1. Launch the application and navigate to the **Port Manager** tab (default).
2. Enter target port(s) in the input field. Examples:

   ```
   3000                        # Single port
   3000-4000                   # Port range
   3000,8080,9000              # Comma-separated
   3000,8080,9000-9010         # Mixed format
   ```

3. Alternatively, click any **common port button** to add it to the input.
4. Review the **port preview** to confirm the ports to be terminated.
5. Click **"End Port Process(es)"** or press `Enter`.
6. Review the **results** - each port shows a success (green) or failure (red) status with details.

### Viewing System Information

1. Click **System Info** in the sidebar.
2. The system information will load automatically and display:
   - Operating System details
   - CPU information
   - Memory usage statistics
3. Click **Refresh** to update the data.

### Switching Language

Click the language toggle button in the top-right corner of the header bar to switch between English and Chinese.

## Project Structure

```
port-manager/
├── src/                          # React frontend
│   ├── components/
│   │   ├── PortManager.tsx       # Port killing UI
│   │   ├── SystemInfo.tsx        # System information display
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   └── LanguageSwitcher.tsx  # Language toggle
│   ├── i18n/
│   │   ├── config.ts             # i18next initialization
│   │   └── locales/
│   │       ├── en.json           # English translations
│   │       └── zh.json           # Chinese translations
│   ├── App.tsx                   # Root component with routing
│   ├── main.tsx                  # Application entry point
│   └── styles.css                # Global styles
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Core logic (port kill, system info)
│   │   └── main.rs               # Binary entry point
│   ├── icons/                    # Application icons
│   └── tauri.conf.json           # Tauri configuration
├── .github/workflows/
│   ├── ci-build.yml              # CI build pipeline
│   └── release.yml               # Release publishing workflow
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Configuration

### Tauri Settings

Key configuration from [tauri.conf.json](src-tauri/tauri.conf.json):

| Setting               | Value                               |
| --------------------- | ----------------------------------- |
| App Identifier        | `com.portmanager.app`               |
| Version               | `1.0.0`                             |
| Window Size           | 960 x 680                           |
| Min Window Size       | 800 x 500                           |
| Dev Server            | `http://localhost:1420`             |
| Dev HMR Port          | 1421                                |
| Bundle Targets        | dmg, msi, deb, AppImage             |

### Environment Variables

| Variable        | Purpose                          |
| --------------- | -------------------------------- |
| `TAURI_DEV_HOST` | Set to enable network-accessible dev server |

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration and delivery:

### CI Build (`ci-build.yml`)

Triggered on version tag pushes (`v*.*.*`). Builds for 4 targets in parallel:

| Target                   | Platform                     |
| ------------------------ | ---------------------------- |
| `aarch64-apple-darwin`   | Apple Silicon (M1/M2/M3) Mac |
| `x86_64-apple-darwin`    | Intel Mac                    |
| `x86_64-pc-windows-msvc` | Windows                      |
| `x86_64-unknown-linux-gnu` | Linux                      |

### Release (`release.yml`)

Manual workflow that creates a GitHub Release from CI build artifacts:

1. Trigger the workflow via GitHub Actions UI.
2. Specify the version tag, draft, and pre-release options.
3. Artifacts from all platforms are collected and published as a single release.

## Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork** the repository.
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`).
3. **Commit your changes** (`git commit -m 'Add amazing feature'`).
4. **Push to the branch** (`git push origin feature/amazing-feature`).
5. **Open a Pull Request**.

### Development Tips

- Ensure Rust and Node.js are installed before starting.
- Run `npm run tauri:dev` for development with hot reload.
- Run `npm run build` to verify TypeScript compilation and frontend build.
- On Windows, some port numbers may be in use by system processes and require administrator privileges.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop application framework
- [React](https://react.dev/) - UI library
- [Vite](https://vitejs.dev/) - Build tool
- [i18next](https://www.i18next.com/) - Internationalization framework
- [sysinfo](https://github.com/GuillaumeGomez/sysinfo) - Rust system information crate
