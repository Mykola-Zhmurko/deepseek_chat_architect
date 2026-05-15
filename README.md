# DeepSeek Chat Architect

Organize your DeepSeek AI chats into folders with a sleek, native-feeling interface. Inspired by the popular "Chat Architect" for Gemini, this extension brings powerful chat management to DeepSeek.

## 🚀 Features

- **📂 Custom Folders**: Create, rename, and delete folders to group your chats.
- **🖱️ Drag & Drop**: Easily move chats from the native DeepSeek sidebar into your custom folders.
- **🔍 Deep Search**: Search through both folder names and individual chat titles simultaneously.
- **⚡ Quick Access**: Open chats directly from the folder panel.
- **📤 Import/Export**: Backup your folder structure or move it to another browser with JSON support.
- **🌓 Dark Mode Support**: Automatically matches DeepSeek's UI theme.

## 🛠️ Installation (Development Mode)

Since this extension is in development, you can install it manually in Google Chrome:

1. **Download/Clone** this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click the **Load unpacked** button.
5. Select the folder containing the extension files (`manifest.json`, `content.js`, `styles.css`).
6. Open [chat.deepseek.com](https://chat.deepseek.com) and start organizing!

## 📁 Project Structure

- `manifest.json`: Extension configuration and permissions.
- `content.js`: The core logic for DOM manipulation, drag-and-drop, and state management.
- `styles.css`: Custom styling to ensure the panel integrates seamlessly with the DeepSeek sidebar.

## 📝 License

This project is open-source. Feel free to contribute or modify it for your own needs!