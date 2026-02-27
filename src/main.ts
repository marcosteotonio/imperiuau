/// <reference types="@tauri-apps/api" />

import jsPDF from "jspdf";

interface FilaItem {
  id: number;
  imageData: string | null; // Base64
  name: string | null;
}

const PRESETS = {
  P: { size: 19.5, qtyPerRow: 8, rowsCount: 10 },
  M: { size: 24.5, qtyPerRow: 6, rowsCount: 8 },
  G: { size: 31, qtyPerRow: 5, rowsCount: 6 },
};

const FABRIC_LIMITS = {
  ALTURA_TECIDO_CM: 156, // Dimensão fixa do rolo
  LARGURA_MAX_CM: 200, // Comprimento máximo da produção
};

class EstampariaApp {
  private currentSize: keyof typeof PRESETS | null = null;
  private filas: FilaItem[] = [];
  private isTauri: boolean;
  private totalUsageHeightCm: number = 0;

  constructor() {
    this.isTauri =
      typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;
    this.initializeEventListeners();
    this.renderFilas();
  }

  private initializeEventListeners(): void {
    document.getElementById("generate-btn")?.addEventListener("click", () => {
      this.generatePDF();
    });

    // Preset buttons
    document.querySelectorAll(".btn-preset").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const sizeKey = target.dataset.size as keyof typeof PRESETS;
        this.setLayout(sizeKey);

        // Highlight active preset
        document
          .querySelectorAll(".btn-preset")
          .forEach((b) => b.classList.remove("active"));
        target.classList.add("active");
      });
    });
  }

  private setLayout(sizeKey: keyof typeof PRESETS): void {
    this.currentSize = sizeKey;
    const preset = PRESETS[sizeKey];

    // Initialize filas
    this.filas = [];
    for (let i = 0; i < preset.rowsCount; i++) {
      this.filas.push({ id: i + 1, imageData: null, name: null });
    }

    const summary = document.getElementById("layout-summary")!;
    summary.innerHTML = `Tamanho <strong>${sizeKey}</strong> (${preset.size}x${preset.size}cm) - <strong>${preset.rowsCount} filas</strong> de <strong>${preset.qtyPerRow} imagens</strong> cada.`;

    this.calculateUsage();
    this.renderFilas();
  }

  private async handleFilaUpload(filaId: number, file: File): Promise<void> {
    if (!this.currentSize) return;
    const preset = PRESETS[this.currentSize];

    try {
      const resizedImageData = await this.resizeImage(file, preset.size);
      const fila = this.filas.find((f) => f.id === filaId);
      if (fila) {
        fila.imageData = resizedImageData;
        fila.name = file.name;
        this.renderFilas();
      }
    } catch (error) {
      console.error("Error uploading to fila:", error);
      alert("Erro ao processar imagem: " + (error as Error).message);
    }
  }

  private async resizeImage(file: File, targetSizeCm: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        const DPI = 150;
        const PX_PER_CM = DPI / 2.54;
        const targetSizePx = Math.round(targetSizeCm * PX_PER_CM);

        const canvas = document.createElement("canvas");
        canvas.width = targetSizePx;
        canvas.height = targetSizePx;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw resized image
        ctx.drawImage(img, 0, 0, targetSizePx, targetSizePx);

        // Get base64
        const base64 = canvas.toDataURL("image/png");
        resolve(base64);
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  }

  private renderFilas(): void {
    const container = document.getElementById("rows-container")!;

    if (!this.currentSize) {
      return; // Keep initial empty state
    }

    const preset = PRESETS[this.currentSize];

    container.innerHTML = this.filas
      .map(
        (fila) => `
        <div class="row-card" data-fila-id="${fila.id}">
          <div class="row-card-header">
            <span class="row-number">Fila ${fila.id}</span>
            <span class="row-qty">${preset.qtyPerRow} unid.</span>
          </div>
          <div class="row-preview" id="preview-${fila.id}">
            ${
              fila.imageData
                ? `<img src="${fila.imageData}" alt="Preview" />`
                : `<span>Clique para selecionar a imagem da fila ${fila.id}</span>`
            }
          </div>
          <input type="file" id="input-${fila.id}" accept="image/png,image/jpeg,image/jpg" hidden />
          <button class="btn btn-blue btn-row-upload" data-id="${fila.id}">
            ${fila.imageData ? "Trocar Imagem" : "Escolher Imagem"}
          </button>
        </div>
      `,
      )
      .join("");

    // Add event listeners for each row
    this.filas.forEach((fila) => {
      const input = document.getElementById(
        `input-${fila.id}`,
      ) as HTMLInputElement;
      const preview = document.getElementById(`preview-${fila.id}`);
      const btn = document.querySelector(`button[data-id="${fila.id}"]`);

      const triggerUpload = () => input.click();

      preview?.addEventListener("click", triggerUpload);
      btn?.addEventListener("click", triggerUpload);

      input.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
          this.handleFilaUpload(fila.id, target.files[0]);
        }
      });
    });
  }

  private calculateUsage(): void {
    if (!this.currentSize) {
      this.totalUsageHeightCm = 0;
    } else {
      const preset = PRESETS[this.currentSize];
      this.totalUsageHeightCm = preset.rowsCount * preset.size;
    }
    this.updateUsageUI();
  }

  private updateUsageUI(): void {
    const usageText = document.getElementById("usage-text")!;
    const usageBar = document.getElementById("usage-bar")!;

    usageText.textContent = `${this.totalUsageHeightCm.toFixed(1)} / ${FABRIC_LIMITS.LARGURA_MAX_CM} cm`;

    const percentage =
      (this.totalUsageHeightCm / FABRIC_LIMITS.LARGURA_MAX_CM) * 100;
    usageBar.style.width = `${Math.min(percentage, 100)}%`;

    // Visual feedback
    usageBar.classList.remove("warning", "danger");
    if (percentage > 100) {
      usageBar.classList.add("danger");
    } else if (percentage > 80) {
      usageBar.classList.add("warning");
    }
  }

  private async generatePDF(): Promise<void> {
    if (!this.currentSize) {
      alert("Por favor, selecione um tamanho de trabalho primeiro.");
      return;
    }

    const filledFilas = this.filas.filter((f) => f.imageData !== null);
    if (filledFilas.length === 0) {
      alert("Por favor, adicione pelo menos uma imagem a uma fila.");
      return;
    }

    try {
      const preset = PRESETS[this.currentSize];
      const DPI = 150;
      const PX_PER_CM = DPI / 2.54;
      const ROLL_WIDTH_PX = Math.round(
        FABRIC_LIMITS.ALTURA_TECIDO_CM * PX_PER_CM,
      );

      // Create PDF based on all rows (even empty ones to maintain consistency)
      const finalHeightPx =
        Math.round(preset.rowsCount * preset.size * PX_PER_CM) + 40;

      const doc = new jsPDF({
        orientation: "p",
        unit: "px",
        format: [ROLL_WIDTH_PX, finalHeightPx],
      });

      const MARGIN = 10;
      const imgSizePx = Math.round(preset.size * PX_PER_CM);

      this.filas.forEach((fila, rowIndex) => {
        if (!fila.imageData) return;

        const y = Math.round(rowIndex * preset.size * PX_PER_CM) + MARGIN;

        for (let col = 0; col < preset.qtyPerRow; col++) {
          const x = Math.round(col * preset.size * PX_PER_CM) + MARGIN;

          doc.addImage(fila.imageData, "PNG", x, y, imgSizePx, imgSizePx);
        }
      });

      // Generate PDF blob
      const pdfBlob = doc.output("arraybuffer");

      const fileName = `producao_tamanho_${this.currentSize}.pdf`;

      if (this.isTauri) {
        // Import Tauri dialog plugin only when in Tauri environment
        const { save } = await import("@tauri-apps/plugin-dialog");

        const defaultPath = await save({
          title: "Salvar PDF de Produção",
          defaultPath: fileName,
          filters: [
            {
              name: "PDF",
              extensions: ["pdf"],
            },
          ],
        });

        if (defaultPath) {
          // Use browser's download API in Tauri
          const blob = new Blob([pdfBlob], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = defaultPath;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          alert("PDF gerado com sucesso!");
        }
      } else {
        // Browser fallback
        const blob = new Blob([pdfBlob], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert("PDF gerado com sucesso!");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Erro ao gerar PDF: " + (error as Error).message);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new EstampariaApp();
});
