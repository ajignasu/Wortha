document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const uploadArea = document.getElementById('upload-area');
    const selectedFileDiv = document.getElementById('selected-file');
    const fileNameSpan = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file');
    const imagePreviews = document.getElementById('image-previews');
    
    let uploadedFile = null;

    // Upload area click handler
    uploadArea.addEventListener('click', () => {
        imageInput.click();
    });

    // Drag and drop handlers
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleFileSelect(files[0]);
        }
    });

    // File input change handler
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Remove file handler
    removeFileBtn.addEventListener('click', () => {
        uploadedFile = null;
        imageInput.value = '';
        selectedFileDiv.style.display = 'none';
        uploadArea.style.display = 'block';
        analyzeBtn.disabled = true;
    });

    function handleFileSelect(file) {
        if (file.size > 10 * 1024 * 1024) {
            alert('File size must be less than 10MB');
            return;
        }
        
        uploadedFile = file;
        fileNameSpan.textContent = file.name;
        selectedFileDiv.style.display = 'block';
        uploadArea.style.display = 'none';
        analyzeBtn.disabled = false;
    }

    // Analyze button click handler
    analyzeBtn.addEventListener('click', async () => {
        if (!uploadedFile) {
            alert('Please select an image file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', uploadedFile);
        
        // Check if real-time pricing is enabled
        const useRealPrices = document.getElementById('real-time-pricing').checked;
        const queryParams = new URLSearchParams({ use_real_prices: useRealPrices });

        // Show progress section
        progressSection.style.display = 'block';
        resultsContainer.style.display = 'none';
        imagePreviews.style.display = 'none';
        analyzeBtn.disabled = true;

        // Update progress text based on pricing option
        const initialText = useRealPrices ? 'Uploading image...' : 'Uploading image...';
        updateProgress(0, initialText);
        
        try {
            // Start progress animation
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 70 && useRealPrices) {
                    updateProgress(progress, 'Searching for current market prices...');
                } else if (progress > 90) {
                    progress = 90;
                    updateProgress(progress, 'Finalizing results...');
                } else {
                    updateProgress(progress, 'Analyzing image with Gemini...');
                }
            }, 300);

            const response = await fetch(`/api/analyze-image?${queryParams}`, {
                method: 'POST',
                body: formData,
            });

            clearInterval(progressInterval);
            updateProgress(95, 'Processing results...');

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            } else {
                updateProgress(100, 'Complete!');
                setTimeout(() => {
                    displayResults(result);
                    progressSection.style.display = 'none';
                    analyzeBtn.disabled = false;
                }, 500);
            }

        } catch (error) {
            progressSection.style.display = 'none';
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = `
                <div style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 1rem; border-radius: 8px;">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
            analyzeBtn.disabled = false;
        }
    });

    function updateProgress(percent, text) {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = text;
    }

    function displayResults(data) {
        const { bom, total_cost, overlay_url, color_map } = data;

        // Display images
        const originalImageURL = URL.createObjectURL(uploadedFile);
        imagePreviews.style.display = 'block';
        imagePreviews.innerHTML = `
            <h3 class="visual-breakdown-title">Visual Breakdown</h3>
            <div class="image-grid">
                <div class="image-column">
                    <h4>Original Image</h4>
                    <div class="image-container">
                        <img src="${originalImageURL}" alt="Original" class="preview-img" />
                    </div>
                </div>
                <div class="image-column">
                    <h4>Detected Objects</h4>
                    <div class="image-container">
                        <img src="${overlay_url}" alt="Segmented" class="preview-img" />
                    </div>
                </div>
            </div>
        `;

        // Group BOM by object
        const groupedBOM = {};
        bom.forEach(item => {
            if (!groupedBOM[item.object]) {
                groupedBOM[item.object] = {
                    parts: [],
                    total: 0,
                    color: item.color
                };
            }
            groupedBOM[item.object].parts.push(item);
            groupedBOM[item.object].total += item.cost;
        });

        // Create per-object view
        let perObjectHTML = '';
        Object.entries(groupedBOM).forEach(([objectName, objectData]) => {
            const colorStyle = objectData.color ? `style="background-color: ${objectData.color};"` : '';
            perObjectHTML += `
                <div class="object-group">
                    <div class="object-header">
                        <span class="object-color-indicator" ${colorStyle}></span>
                        <span class="object-name">${objectName}</span>
                        <span class="object-total">${objectData.total.toFixed(2)}</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Part</th>
                                <th>Material</th>
                                <th>Cost</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            objectData.parts.forEach(part => {
                perObjectHTML += `
                    <tr>
                        <td>${part.part}</td>
                        <td>${part.material}</td>
                        <td class="cost-cell">${part.cost.toFixed(2)}</td>
                    </tr>
                `;
            });
            
            perObjectHTML += `
                        </tbody>
                    </table>
                </div>
            `;
        });

        // Create full scene view
        let fullSceneHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Object</th>
                            <th>Part</th>
                            <th>Material</th>
                            <th>Estimated Cost</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        bom.forEach(item => {
            const colorStyle = item.color ? `style="background-color: ${item.color};"` : '';
            fullSceneHTML += `
                <tr>
                    <td>
                        <div class="object-label">
                            <span class="color-indicator" ${colorStyle}></span>
                            ${item.object}
                        </div>
                    </td>
                    <td>${item.part}</td>
                    <td>${item.material}</td>
                    <td class="cost-cell">${item.cost.toFixed(2)}</td>
                </tr>
            `;
        });

        fullSceneHTML += `
                    </tbody>
                </table>
            </div>
        `;

        // Build final results HTML with tabs
        resultsContainer.innerHTML = `
            <h2>Bill of Materials</h2>
            
            <div class="tab-navigation">
                <button class="tab-button active" onclick="switchTab('per-object')">By Object</button>
                <button class="tab-button" onclick="switchTab('full-scene')">Full Scene</button>
            </div>
            
            <div id="per-object" class="tab-content active">
                ${perObjectHTML}
            </div>
            
            <div id="full-scene" class="tab-content">
                ${fullSceneHTML}
            </div>
            
            <div class="total-section">
                <span class="total-label">Total Estimated Cost</span>
                <span class="total-amount">${total_cost.toFixed(2)}</span>
            </div>
        `;

        resultsContainer.style.display = 'block';
    }

    // Tab switching function
    window.switchTab = function(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
            if (btn.textContent.includes(tabName === 'per-object' ? 'By Object' : 'Full Scene')) {
                btn.classList.add('active');
            }
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');
    };
});