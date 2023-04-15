import { MdContentCopy } from "react-icons/md";
import { Modal } from "../ui/Modal";
import { useContext, useEffect, useMemo, useState } from "react";
import { NotebookContext } from "../notebook/NotebookContext";

export const ShareNoteModal: React.FC<
    Omit<React.ComponentProps<typeof Modal>, "isOpen" | "onRequestClose">
> = ({ ...modalProps }) => {
    const { notebookContextState: { shareModalNoteId }, setNotebookContextState } = useContext(NotebookContext);
    const [isSuccess, setSuccess] = useState(false);

    const shareLink = useMemo(() => {
        if (typeof document !== "undefined") {
            const { origin, pathname } = new URL(document.URL);
            return `${origin}${pathname}note/${shareModalNoteId}`;
        } else {
            return `/${shareModalNoteId}`
        }
    }, [shareModalNoteId])

    useEffect(() => {
        setSuccess(false)
    }, [shareModalNoteId])

    return (
        <Modal
            isOpen={!!shareModalNoteId}
            onRequestClose={() => setNotebookContextState((prevState) => ({
                ...prevState,
                shareModalNoteId: undefined
            }))}
            {...modalProps}
        >
            <div className="flex flex-col">
                <span className="border-b border-b-gray-200 font-bold text-2xl pb-2 mb-2">Share Note</span>
                <div className="mt-2 flex flex-row items-stretch">
                    <span className="rounded-l-md bg-zinc-200 border-2 border-solid border-gray-400 p-2 text-zinc-400">{shareLink}</span>
                    <button
                        className="rounded-r-md border-gray-400 border-solid border-2 border-l-0 px-2 flex items-center hover:bg-cyan-100 transition-colors"
                        onClick={async () => {
                            await navigator.clipboard.writeText(shareLink);
                            setSuccess(true);
                        }}
                    >
                        <MdContentCopy className="mr-1" />{isSuccess ? "Copied" : "Copy"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}