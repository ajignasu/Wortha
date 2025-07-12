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
        const { bom, total_cost, overlay_url, color_map, objects } = data;

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

        // Add interactive bounding boxes on detected objects image
        const overlayImg = imagePreviews.querySelector('.image-column:nth-child(2) img');
        addBoundingBoxes(overlayImg, objects);

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
                        <button class="obj-tab price-tab active" data-label="${objectName}">Price Breakdown</button>
                        <button class="obj-tab instr-tab" data-label="${objectName}">Manufacturing Instructions</button>
                        <span class="object-total">${objectData.total.toFixed(2)}</span>
                    </div>
                    <div class="price-content">
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
                    <div class="instr-content" id="instr-${objectName.replace(/\s+/g,'-')}"><em>Click \"Manufacturing Instructions\" to load.</em></div>
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

        // Attach tab handlers for each object
        document.querySelectorAll('.obj-tab.instr-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                const label = btn.dataset.label;
                const obj = objects.find(o => o.label === label);
                if (!obj) return;
                const contentDiv = document.querySelector(`#instr-${label.replace(/\s+/g,'-')}`);
                const priceDiv = contentDiv.previousElementSibling;
                // set active states
                btn.classList.add('active');
                btn.previousElementSibling.classList.remove('active');
                priceDiv.style.display = 'none';
                contentDiv.style.display = 'block';
                // if already loaded, just show cached content
                if (contentDiv.dataset.loaded) {
                    priceDiv.style.display = 'none';
                    contentDiv.style.display = 'block';
                    return;
                }
                contentDiv.innerHTML = '<em>Generating instructions...</em>';
                try {
                    const resp = await fetch('/api/instructions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label: obj.label, parts: obj.parts })
                    });
                    const data = await resp.json();
                    if (data.instructions) {
                        // naive markdown to HTML: convert line breaks
                        contentDiv.innerHTML = marked.parse(data.instructions);
                        contentDiv.dataset.loaded = 'true';
                    } else {
                        contentDiv.textContent = data.detail || 'Failed to get instructions';
                    }
                } catch (err) {
                    contentDiv.textContent = err.message || 'Error generating instructions';
                    contentDiv.dataset.loaded = 'true';
                }
            });
        });
    }

    // Attach price tab handlers
        // Delegated handler to cover dynamically modified DOM and ensure consistent switching
        resultsContainer.addEventListener('click', e => {
            const tabBtn = e.target.closest('.obj-tab');
            if (!tabBtn) return;
            const group = tabBtn.closest('.object-group');
            if (!group) return;
            const priceDiv = group.querySelector('.price-content');
            const instrDiv = group.querySelector('.instr-content');
            const isPrice = tabBtn.classList.contains('price-tab');
            const priceBtn = group.querySelector('.price-tab');
            const instrBtn = group.querySelector('.instr-tab');
            if (isPrice) {
                // activate price view
                priceBtn.classList.add('active');
                instrBtn.classList.remove('active');
                priceDiv.style.display = 'block';
                instrDiv.style.display = 'none';
            } else {
                // manufacturing instructions tab
                instrBtn.classList.add('active');
                priceBtn.classList.remove('active');
                priceDiv.style.display = 'none';
                instrDiv.style.display = 'block';
                if (!instrDiv.dataset.loaded) {
                    instrDiv.innerHTML = '<em>Generating instructions...</em>';
                    const obj = objects.find(o => o.label === tabBtn.dataset.label);
                    if (obj) {
                        fetch('/api/instructions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ label: obj.label, parts: obj.parts })
                        }).then(r=>r.json()).then(data=>{
                            if (data.instructions) {
                                instrDiv.innerHTML = marked.parse(data.instructions);
                            } else {
                                instrDiv.textContent = data.detail || 'Failed to get instructions';
                            }
                            instrDiv.dataset.loaded = 'true';
                        }).catch(err=>{
                            instrDiv.textContent = err.message || 'Error generating instructions';
                            instrDiv.dataset.loaded = 'true';
                        });
                    }
                }
            }
        });

        // Legacy individual listeners (kept for safety but can be removed later)
        document.querySelectorAll('.obj-tab.price-tab').forEach(btn=>{
            btn.addEventListener('click',()=>{
                const group = btn.closest('.object-group');
                const priceDiv = group.querySelector('.price-content');
                const instrDiv = group.querySelector('.instr-content');
                const instrTab = group.querySelector('.instr-tab');
                btn.classList.add('active');
                if (instrTab) instrTab.classList.remove('active');
                priceDiv.style.display = 'block';
                instrDiv.style.display = 'none';
            });
        });

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

    // Helper to overlay SVG bounding boxes and attach click events
    function addBoundingBoxes(imgEl, objects) {
        if (!imgEl) return;
        if (!imgEl.complete) {
            imgEl.onload = () => addBoundingBoxes(imgEl, objects);
            return;
        }
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        const container = imgEl.parentElement;
        const prev = container.querySelector('svg.bbox-overlay');
        if (prev) prev.remove();
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'bbox-overlay');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        container.appendChild(svg);
        objects.forEach(obj => {
            if (!obj.bbox) return;
            const [y0, x0, y1, x1] = obj.bbox;
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', x0 * w);
            rect.setAttribute('y', y0 * h);
            rect.setAttribute('width', (x1 - x0) * w);
            rect.setAttribute('height', (y1 - y0) * h);
            rect.setAttribute('stroke', obj.color || '#ff5500');
            rect.setAttribute('stroke-opacity', '0.9');
            rect.setAttribute('fill', 'transparent');
            rect.dataset.label = obj.label;
            rect.addEventListener('click', () => {
                const btn = document.querySelector(`.obj-tab.instr-tab[data-label="${obj.label}"]`);
                if (btn) btn.click();
            });
            svg.appendChild(rect);
        });
    }
});
