import React, { useState } from "react";
import Modal from "../Generic/Modal";
import { Button } from "@material-tailwind/react";
import LLMSettings from "./LLMSettings";
import EmbeddingModelManager from "./EmbeddingSettings";
import DirectorySelector from "./DirectorySelector";
import { set } from "date-fns";

interface InitialSettingsProps {
  finishedSettingInitialSettings: (vaultDirectoryForWindow: string) => void;
  // setVaultDirectory: (path: string) => void;
}

const InitialSetupSinglePage: React.FC<InitialSettingsProps> = ({
  finishedSettingInitialSettings,
  // setVaultDirectory,
}) => {
  // const [userDirectory, setUserDirectory] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showError, setShowError] = useState(false);
  const [userDirectory, setUserDirectory] = useState<string>("");

  const handleDirectorySelection = async () => {
    const paths = await window.files.openDirectoryDialog();
    if (paths && paths[0]) {
      setUserDirectory(paths[0]);
      await window.electronStore.setCurrentWindowsVaultDirectory(paths[0]);
    }
  };

  const handleNext = () => {
    if (errorMsg === "") {
      finishedSettingInitialSettings(userDirectory);
    } else {
      setShowError(true);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => console.log("Not allowing a close for now")}
      hideCloseButton={true}
    >
      <div className="w-full mr-4 ml-2">
        <div className="ml-2 mt-0 h-full  ">
          <h2 className="text-2xl font-semibold mb-0 text-white">
            Welcome to the Reor Project.
          </h2>
          <p className="mt-2 text-gray-100 ">
            Reor is a self-organising note-taking app. Each note will be saved
            as a markdown file to a &quot;vault&quot; directory on your machine.
          </p>
          <p className="mt-2 text-gray-100">
            Choose your vault directory here:
          </p>
          <div>
            <Button
              className="bg-slate-700  border-none h-10 hover:bg-slate-900 cursor-pointer w-[140px] text-center pt-0 pb-0 pr-2 pl-2"
              onClick={handleDirectorySelection}
              placeholder=""
            >
              Select Directory
            </Button>
            {userDirectory && (
              <p className="mt-2 text-xs text-gray-100">
                Selected: <strong>{userDirectory}</strong>
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-100 ">
            Your vault directory doesn&apos;t need to be empty. Only markdown
            files will be indexed.
          </p>

          <div className="mt-8">
            <EmbeddingModelManager>
              <h3 className="font-semibold mb-2 text-white">Embedding Model</h3>
            </EmbeddingModelManager>
          </div>
          <LLMSettings isInitialSetup={true} />
          <Button
            className="bg-slate-700 mt-4 mb-3  border-none h-10 hover:bg-slate-900 cursor-pointer w-[80px] text-center pt-0 pb-0 pr-2 pl-2"
            onClick={handleNext}
            placeholder=""
          >
            Next
          </Button>
          {showError && errorMsg && (
            <p className="text-xs text-red-500">{errorMsg}</p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default InitialSetupSinglePage;
