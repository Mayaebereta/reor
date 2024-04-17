import { useEffect, useRef, useState } from "react";
import { useEditor, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Text from "@tiptap/extension-text";
import "../tiptap.scss";
import { useDebounce } from "use-debounce";
import { Markdown } from "tiptap-markdown";

import { BacklinkExtension } from "@/components/Editor/BacklinkExtension";
import {
  getInvalidCharacterInFileName,
  removeFileExtension,
} from "@/functions/strings";
import { SuggestionsState } from "@/components/Editor/BacklinkSuggestionsDisplay";
import { toast } from "react-toastify";

export const useFileByFilepath = () => {
  const [currentlyOpenedFilePath, setCurrentlyOpenedFilePath] = useState<
    string | null
  >(null);
  const [suggestionsState, setSuggestionsState] =
    useState<SuggestionsState | null>();
  const [isFileContentModified, setIsFileContentModified] =
    useState<boolean>(false);
  const [noteToBeRenamed, setNoteToBeRenamed] = useState<string>("");
  const [fileDirToBeRenamed, setFileDirToBeRenamed] = useState<string>("");
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [currentlyChangingFilePath, setCurrentlyChangingFilePath] =
    useState(false);

  const setFileNodeToBeRenamed = async (filePath: string) => {
    const isDirectory = await window.files.isDirectory(filePath);
    if (isDirectory) {
      setFileDirToBeRenamed(filePath);
    } else {
      setNoteToBeRenamed(filePath);
    }
  };

  /**
	 * with this editor, we want to take the HTML on the following scenarios:
		1. when the file path changes, causing a re-render
		2. When the component unmounts
		3. when the file is deleted
	 */
  Markdown.configure({
    html: true, // Allow HTML input/output
    tightLists: true, // No <p> inside <li> in markdown output
    tightListClass: "tight", // Add class to <ul> allowing you to remove <p> margins when tight
    bulletListMarker: "-", // <li> prefix in markdown output
    linkify: false, // Create links from "https://..." text
    breaks: true, // New lines (\n) in markdown input are converted to <br>
    transformPastedText: false, // Allow to paste markdown text in the editor
    transformCopiedText: false, // Copied text is transformed to markdown
  });

  const openFileByPath = async (newFilePath: string) => {
    setCurrentlyChangingFilePath(true);
    await saveEditorContentToPath(editor, currentlyOpenedFilePath, true);
    const newFileContent = (await window.files.readFile(newFilePath)) ?? "";
    editor?.commands.setContent(newFileContent);
    setCurrentlyOpenedFilePath(newFilePath);
    setCurrentlyChangingFilePath(false);
  };

  const openRelativePath = async (relativePath: string): Promise<void> => {
    const invalidChars = await getInvalidCharacterInFileName(relativePath);
    if (invalidChars) {
      toast.error(
        `Could not create note ${relativePath}. Character ${invalidChars} cannot be included in note name.`
      );
      return;
    }
    const relativePathWithExtension =
      window.path.addExtensionIfNoExtensionPresent(relativePath);
    const absolutePath = window.path.join(
      window.electronStore.getVaultDirectory(),
      relativePathWithExtension
    );
    const fileExists = await window.files.checkFileExists(absolutePath);
    if (!fileExists) {
      const basename = await window.path.basename(absolutePath);
      await window.files.createFile(
        absolutePath,
        "## " + removeFileExtension(basename) + "\n"
      );
    }
    openFileByPath(absolutePath);
    // return absolutePath;
  };

  const openRelativePathRef = useRef<(newFilePath: string) => Promise<void>>();
  openRelativePathRef.current = openRelativePath;

  const editor = useEditor({
    autofocus: true,

    onUpdate() {
      setIsFileContentModified(true);
    },
    extensions: [
      StarterKit,
      Document,
      Paragraph,
      Text,
      TaskList,
      Markdown,

      TaskItem.configure({
        nested: true,
      }),
      BacklinkExtension(openRelativePathRef, setSuggestionsState),
    ],
  });

  const [debouncedEditor] = useDebounce(editor?.state.doc.content, 4000);

  useEffect(() => {
    if (debouncedEditor && !currentlyChangingFilePath) {
      saveEditorContentToPath(editor, currentlyOpenedFilePath);
    }
  }, [
    debouncedEditor,
    currentlyOpenedFilePath,
    editor,
    currentlyChangingFilePath,
  ]);

  const saveCurrentlyOpenedFile = async () => {
    await saveEditorContentToPath(editor, currentlyOpenedFilePath);
  };

  const saveEditorContentToPath = async (
    editor: Editor | null,
    filePath: string | null,
    indexFileInDatabase: boolean = false
  ) => {
    if (filePath !== null && isFileContentModified && editor) {
      const markdownContent = getMarkdown(editor);
      if (markdownContent !== null) {
        await window.files.writeFile({
          filePath: filePath,
          content: markdownContent,
        });

        setIsFileContentModified(false);

        if (indexFileInDatabase) {
          window.files.indexFileInDatabase(filePath);
        }
      }
    }
  };

  // delete file depending on file path returned by the listener
  useEffect(() => {
    const deleteFile = async (path: string) => {
      await window.files.deleteFile(path);

      // if it is the current file, clear the content and set filepath to null so that it won't save anything else
      if (currentlyOpenedFilePath === path) {
        editor?.commands.setContent("");
        setCurrentlyOpenedFilePath(null);
      }
    };

    const removeDeleteFileListener = window.ipcRenderer.receive(
      "delete-file-listener",
      deleteFile
    );

    return () => {
      removeDeleteFileListener();
    };
  }, [currentlyOpenedFilePath, editor]);

  const renameFileNode = async (oldFilePath: string, newFilePath: string) => {
    await window.files.renameFileRecursive({
      oldFilePath,
      newFilePath,
    });
    //set the file history array to use the new absolute file path if there is anything matching
    const navigationHistoryUpdated = [...navigationHistory].map((path) => {
      return path.replace(oldFilePath, newFilePath);
    });

    setNavigationHistory(navigationHistoryUpdated);

    //reset the editor to the new file path
    if (currentlyOpenedFilePath === oldFilePath) {
      setCurrentlyOpenedFilePath(newFilePath);
    }
  };

  // open a new file rename dialog
  useEffect(() => {
    const renameFileListener = window.ipcRenderer.receive(
      "rename-file-listener",
      (noteName: string) => setFileNodeToBeRenamed(noteName)
    );

    return () => {
      renameFileListener();
    };
  }, []);

  // cleanup effect ran once, so there was only 1 re-render
  // but for each query to the delete file-listener, you only want to run the listener once, not multiple times.
  // the listener function is ran multiple times, mostly before the cleanup is done, so apparently there are eihther multiple listeners being added, or the event is fired multiple times
  // if multiple listeners -> each of them are given the same active variable so if it mutates, it will all
  // if the event is fired multiple times, each of the time it fires, it keeps going until the function is completed

  // after the effect is re-rendered, it listens to the function properly with active = true.

  // 1. Close window on the backend, trigger savefile
  // 2. on the FE, receives win.webContents.send("prepare-for-window-close", files);
  // 3. FE after saving, alerts backend that is ready for close
  useEffect(() => {
    const handleWindowClose = async () => {
      console.log("saving file", {
        filePath: currentlyOpenedFilePath,
        fileContent: editor?.getHTML() || "",
        editor: editor,
      });
      if (
        currentlyOpenedFilePath !== null &&
        editor &&
        editor.getHTML() !== null
      ) {
        const markdown = getMarkdown(editor);
        await window.files.writeFile({
          filePath: currentlyOpenedFilePath,
          content: markdown,
        });
        await window.files.indexFileInDatabase(currentlyOpenedFilePath);
      }

      window.electron.destroyWindow();
    };

    const removeWindowCloseListener = window.ipcRenderer.receive(
      "prepare-for-window-close",
      handleWindowClose
    );

    return () => {
      removeWindowCloseListener();
    };
  }, [currentlyOpenedFilePath, editor]);

  return {
    filePath: currentlyOpenedFilePath,
    saveCurrentlyOpenedFile,
    editor,
    navigationHistory,
    setNavigationHistory,
    openFileByPath,
    suggestionsState,
    noteToBeRenamed,
    setNoteToBeRenamed,
    fileDirToBeRenamed,
    setFileDirToBeRenamed,
    renameFile: renameFileNode,
  };
};

function getMarkdown(editor: Editor) {
  // Fetch the current markdown content from the editor
  const originalMarkdown = editor.storage.markdown.getMarkdown();
  // Replace the escaped square brackets with unescaped ones
  const modifiedMarkdown = originalMarkdown
    .replace(/\\\[/g, "[") // Replaces \[ with [
    .replace(/\\\]/g, "]"); // Replaces \] with ]

  return modifiedMarkdown;
}
