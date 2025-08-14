# ![TomKit](app/public/TomKit-icon.svg) TomKit

![TomKit](app/public/TomKit.png)

TomKit is a simple Electron-based tool for managing Apache Tomcat installations on your system. It allows you to start and stop Tomcat either as a Homebrew service or via a manual install path.

## Why?
- Honestly, I was getting sick of the bugginess of IntelliJ constantly failing to start or stop tomcat and having to re-create my configurations all the time after an update. So, I thought - Why not build a simple tool that just works for me, and learn a new language at the same time?

## Features

- Start/stop Tomcat as a Homebrew service or manual install

## Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/josephtuckwell/TomKit.git
   cd TomKit
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

## Run

Start the app with:
```sh
npm run start
```

## Packaging

```
npm run build:mac    # Mac OS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## Usage

1. Select the install type (Homebrew or Manual).
2. If using Manual, enter the Tomcat install path.
3. Click **Start** to start Tomcat, or **Stop** to stop it.

---

**Note:**  
- For Homebrew mode, Tomcat must be installed via Homebrew and available as a service.
- For Manual mode, ensure the `startup.sh` and `shutdown.sh` scripts are present and executable in the bin folder of specified directory.