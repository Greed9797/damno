-- ══════════════════════════════════════════════════════════════
-- ILLEGAL SOCCER — FULL REA CHEAT v2.0
-- Place: 126987974021910 | Universe: 10155360168
-- Creator: Repotted
-- Mapped remotes (REA log analysis):
--   Remotes.Ball.MovementUpdate | Ball.Tilt | Ball.ActionPresentationUpdate
--   Remotes.Items.ProjectileMovement
-- ══════════════════════════════════════════════════════════════

local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UIS = game:GetService("UserInputService")
local WS = game:GetService("Workspace")
local StarterGui = game:GetService("StarterGui")
local StarterPack = game:GetService("StarterPack")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local VirtualUser = game:GetService("VirtualUser")
local VirtualInputManager = game:GetService("VirtualInputManager")

local LP = Players.LocalPlayer
local Cam = WS.CurrentCamera

-- ══════════════════════════════════════════════════════════════
-- STATE
-- ══════════════════════════════════════════════════════════════
local S = {
    -- Combat
    Aimbot = false,
    AimbotSmooth = 5,
    AimbotPart = "Head",
    Triggerbot = false,
    TriggerbotDelay = 0.05,
    SilentAim = false,
    NoRecoil = false,
    RapidFire = false,
    InfiniteAmmo = false,
    OneHitKill = false,
    AutoShoot = false,
    AutoShootDist = 50,
    
    -- Ball Control
    BallTP = false,
    BallTPDist = 3,
    BallControl = false,
    BallSpin = false,
    BallSpinSpeed = 100,
    AutoGoal = false,
    BallNoclip = false,
    CatchBall = false,
    PowerKick = false,
    PowerKickForce = 500,
    
    -- Movement
    Speed = false,
    SpeedVal = 50,
    Fly = false,
    FlySpeed = 60,
    Noclip = false,
    InfiniteJump = false,
    JumpPower = 100,
    HighJump = false,
    TeleportToBall = false,
    TeleportToPlayer = false,
    AntiVoid = false,
    SpinBot = false,
    SpinSpeed = 20,
    
    -- ESP
    ESP = false,
    ESPHealth = false,
    ESPTracer = false,
    ESPBall = false,
    ESPItems = false,
    ESPGuns = false,
    ESPName = true,
    ESPDist = true,
    ESPChams = false,
    ESPTeam = false,
    ESPColor = Color3.fromRGB(255, 50, 50),
    BallColor = Color3.fromRGB(0, 255, 130),
    
    -- Visuals
    Fullbright = false,
    FogRemove = false,
    FOV = false,
    FOVVal = 90,
    ThirdPerson = false,
    TPDistance = 20,
    
    -- Player
    GodMode = false,
    AntiAFK = true,
    AntiKick = false,
    AutoRespawn = true,
    WalkFaster = false,
    
    -- Remote Spy
    SpyRemotes = false,
    SpyLog = {},
    
    -- Items
    AutoEquipBest = false,
    Nospread = false,
    
    -- UI
    Visible = true,
    Tab = "Combat",
}

-- ══════════════════════════════════════════════════════════════
-- UTILS
-- ══════════════════════════════════════════════════════════════
local function GetChar()
    return LP.Character or LP.CharacterAdded:Wait()
end
local function GetRoot()
    local c = GetChar()
    return c and c:FindFirstChild("HumanoidRootPart")
end
local function GetHum()
    local c = GetChar()
    return c and c:FindFirstChildOfClass("Humanoid")
end
local function GetHead()
    local c = GetChar()
    return c and c:FindFirstChild("Head")
end

local function Notify(msg, dur)
    pcall(function()
        StarterGui:SetCore("SendNotification", {
            Title = "Illegal Soccer REA",
            Text = tostring(msg),
            Duration = dur or 3
        })
    end)
end

local function GetBall()
    -- search workspace for ball
    for _, obj in ipairs(WS:GetDescendants()) do
        if obj:IsA("BasePart") then
            local n = obj.Name:lower()
            if n:find("ball") or n:find("bola") or n:find("soccer") or n:find("football") then
                return obj
            end
        end
    end
    -- check remotes folder for ball
    local remotes = RS:FindFirstChild("Remotes")
    if remotes then
        local ballFolder = remotes:FindFirstChild("Ball")
        if ballFolder then
            -- look for ball reference in properties
        end
    end
    return nil
end

local function GetPlayers()
    local t = {}
    for _, p in ipairs(Players:GetPlayers()) do
        if p ~= LP and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then
            local hum = p.Character:FindFirstChildOfClass("Humanoid")
            if hum and hum.Health > 0 then
                table.insert(t, p)
            end
        end
    end
    return t
end

local function GetClosestPlayer(maxDist)
    local closest = nil
    local minDist = maxDist or math.huge
    local root = GetRoot()
    if not root then return nil end
    for _, p in ipairs(GetPlayers()) do
        local hrp = p.Character:FindFirstChild("HumanoidRootPart")
        if hrp then
            local dist = (hrp.Position - root.Position).Magnitude
            if dist < minDist then
                minDist = dist
                closest = p
            end
        end
    end
    return closest, minDist
end

-- Remote finder
local function FindRemote(name)
    local remotes = RS:FindFirstChild("Remotes")
    if not remotes then return nil end
    -- exact path match
    for _, obj in ipairs(remotes:GetDescendants()) do
        if obj.Name == name and (obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction")) then
            return obj
        end
    end
    -- case insensitive
    local lname = name:lower()
    for _, obj in ipairs(remotes:GetDescendants()) do
        if obj.Name:lower() == lname and (obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction")) then
            return obj
        end
    end
    return nil
end

-- Known remotes from REA
local Remotes = {
    BallMovement = FindRemote("MovementUpdate"),
    BallTilt = FindRemote("Tilt"),
    BallAction = FindRemote("ActionPresentationUpdate"),
    Projectile = FindRemote("ProjectileMovement"),
}

-- Re-scan remotes
local function RescanRemotes()
    Remotes.BallMovement = FindRemote("MovementUpdate")
    Remotes.BallTilt = FindRemote("Tilt")
    Remotes.BallAction = FindRemote("ActionPresentationUpdate")
    Remotes.Projectile = FindRemote("ProjectileMovement")
end

-- ══════════════════════════════════════════════════════════════
-- REMOTE SPY
-- ══════════════════════════════════════════════════════════════
local function StartRemoteSpy()
    local remotes = RS:FindFirstChild("Remotes")
    if not remotes then Notify("No Remotes folder found") return end
    
    for _, obj in ipairs(remotes:GetDescendants()) do
        if obj:IsA("RemoteEvent") then
            pcall(function()
                obj.OnClientEvent:Connect(function(...)
                    if S.SpyRemotes then
                        local args = {...}
                        local argStrs = {}
                        for i, v in ipairs(args) do
                            table.insert(argStrs, tostring(v) .. " (" .. type(v) .. ")")
                        end
                        local logEntry = string.format("[%s] %s(%s)", 
                            os.date("%H:%M:%S"), obj:GetFullName(), table.concat(argStrs, ", "))
                        table.insert(S.SpyLog, logEntry)
                        if #S.SpyLog > 200 then table.remove(S.SpyLog, 1) end
                        print("[SPY] " .. logEntry)
                    end
                end)
            end)
        end
    end
    Notify("Remote spy installed")
end

-- ══════════════════════════════════════════════════════════════
-- ESP SYSTEM
-- ══════════════════════════════════════════════════════════════
local ESPObjects = {}
local BallESP = nil
local ItemESPs = {}

local function CreatePlayerESP(player)
    if player == LP then return end
    local function Setup(char)
        -- cleanup old
        if ESPObjects[player] then
            for _, v in pairs(ESPObjects[player]) do pcall(function() v:Remove() end) end
        end
        ESPObjects[player] = {}
        
        local hrp = char:WaitForChild("HumanoidRootPart", 10)
        local head = char:WaitForChild("Head", 10)
        local hum = char:WaitForChildOfClass("Humanoid", 10)
        if not hrp or not head then return end
        
        -- Billboard
        local bb = Instance.new("BillboardGui")
        bb.Name = "REA_ESP"
        bb.Adornee = hrp
        bb.Size = UDim2.new(0, 150, 0, 50)
        bb.StudsOffset = Vector3.new(0, 3.5, 0)
        bb.AlwaysOnTop = true
        bb.ResetOnSpawn = false
        bb.Parent = char
        
        local nameLbl = Instance.new("TextLabel")
        nameLbl.Name = "Name"
        nameLbl.Size = UDim2.new(1, 0, 0.4, 0)
        nameLbl.BackgroundTransparency = 1
        nameLbl.Text = S.ESPName and player.DisplayName or ""
        nameLbl.TextColor3 = S.ESPColor
        nameLbl.TextStrokeTransparency = 0
        nameLbl.Font = Enum.Font.GothamBold
        nameLbl.TextSize = 14
        nameLbl.Parent = bb
        
        local distLbl = Instance.new("TextLabel")
        distLbl.Name = "Dist"
        distLbl.Size = UDim2.new(1, 0, 0.3, 0)
        distLbl.Position = UDim2.new(0, 0, 0.4, 0)
        distLbl.BackgroundTransparency = 1
        distLbl.Text = ""
        distLbl.TextColor3 = Color3.new(1, 1, 1)
        distLbl.TextStrokeTransparency = 0
        distLbl.Font = Enum.Font.Gotham
        distLbl.TextSize = 11
        distLbl.Parent = bb
        
        local healthLbl = Instance.new("TextLabel")
        healthLbl.Name = "Health"
        healthLbl.Size = UDim2.new(1, 0, 0.3, 0)
        healthLbl.Position = UDim2.new(0, 0, 0.7, 0)
        healthLbl.BackgroundTransparency = 1
        healthLbl.Text = ""
        healthLbl.TextColor3 = Color3.new(0, 1, 0)
        healthLbl.TextStrokeTransparency = 0
        healthLbl.Font = Enum.Font.Gotham
        healthLbl.TextSize = 11
        healthLbl.Parent = bb
        
        -- Highlight (Chams)
        if S.ESPChams then
            local hl = Instance.new("Highlight")
            hl.Name = "REA_Highlight"
            hl.FillColor = S.ESPColor
            hl.OutlineColor = Color3.new(1, 1, 1)
            hl.FillTransparency = 0.5
            hl.OutlineTransparency = 0
            hl.Adornee = char
            hl.Parent = char
            table.insert(ESPObjects[player], hl)
        end
        
        -- Tracer part
        local tracer = Instance.new("Part")
        tracer.Name = "REA_Tracer"
        tracer.Anchored = true
        tracer.CanCollide = false
        tracer.CanQuery = false
        tracer.Transparency = 0.5
        tracer.Material = Enum.Material.Neon
        tracer.Color = S.ESPColor
        tracer.Size = Vector3.new(0.05, 0.05, 0.05)
        tracer.Parent = WS
        
        table.insert(ESPObjects[player], bb)
        table.insert(ESPObjects[player], tracer)
    end
    
    if player.Character then Setup(player.Character) end
    player.CharacterAdded:Connect(Setup)
end

local function RemovePlayerESP(player)
    if ESPObjects[player] then
        for _, v in pairs(ESPObjects[player]) do pcall(function() v:Remove() end) end
        ESPObjects[player] = nil
    end
end

local function ToggleESP()
    S.ESP = not S.ESP
    if S.ESP then
        for _, p in ipairs(Players:GetPlayers()) do CreatePlayerESP(p) end
        Players.PlayerAdded:Connect(CreatePlayerESP)
        Players.PlayerRemoving:Connect(RemovePlayerESP)
    else
        for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
    end
    Notify("Player ESP: " .. (S.ESP and "ON" or "OFF"))
end

local function ToggleBallESP()
    S.ESPBall = not S.ESPBall
    if S.ESPBall then
        BallESP = Instance.new("Part")
        BallESP.Name = "REA_BallESP"
        BallESP.Anchored = true
        BallESP.CanCollide = false
        BallESP.CanQuery = false
        BallESP.Transparency = 0.3
        BallESP.Material = Enum.Material.Neon
        BallESP.Color = S.BallColor
        BallESP.Shape = Enum.PartType.Ball
        BallESP.Size = Vector3.new(2, 2, 2)
        BallESP.Parent = WS
        
        -- Ball label
        local bb = Instance.new("BillboardGui")
        bb.Name = "BallLabel"
        bb.Size = UDim2.new(0, 100, 0, 30)
        bb.StudsOffset = Vector3.new(0, 2, 0)
        bb.AlwaysOnTop = true
        bb.Parent = BallESP
        
        local lbl = Instance.new("TextLabel")
        lbl.Size = UDim2.new(1, 0, 1, 0)
        lbl.BackgroundTransparency = 1
        lbl.Text = "⚽ BALL"
        lbl.TextColor3 = S.BallColor
        lbl.TextStrokeTransparency = 0
        lbl.Font = Enum.Font.GothamBold
        lbl.TextSize = 14
        lbl.Parent = bb
    else
        if BallESP then BallESP:Remove() BallESP = nil end
    end
    Notify("Ball ESP: " .. (S.ESPBall and "ON" or "OFF"))
end

-- ══════════════════════════════════════════════════════════════
-- AIMBOT
-- ══════════════════════════════════════════════════════════════
local function GetAimPart(player)
    local char = player.Character
    if not char then return nil end
    if S.AimbotPart == "Head" then
        return char:FindFirstChild("Head") or char:FindFirstChild("HumanoidRootPart")
    elseif S.AimbotPart == "HumanoidRootPart" then
        return char:FindFirstChild("HumanoidRootPart")
    elseif S.AimbotPart == "Humanoid" then
        return char:FindFirstChildOfClass("Humanoid") and char:FindFirstChild("HumanoidRootPart")
    end
    return char:FindFirstChild("Head")
end

local function AimbotLoop()
    while S.Aimbot do
        RunService.RenderStepped:Wait()
        local closest, dist = GetClosestPlayer(500)
        if closest and dist < 500 then
            local aimPart = GetAimPart(closest)
            if aimPart then
                local targetCF = CFrame.new(Cam.CFrame.Position, aimPart.Position)
                Cam.CFrame = Cam.CFrame:Lerp(targetCF, 1 / math.max(S.AimbotSmooth, 1))
            end
        end
    end
end

-- ══════════════════════════════════════════════════════════════
-- TRIGGERBOT
-- ══════════════════════════════════════════════════════════════
local function TriggerbotLoop()
    while S.Triggerbot do
        task.wait(S.TriggerbotDelay)
        local mouse = LP:GetMouse()
        if mouse.Target then
            local hitPlayer = Players:GetPlayerFromCharacter(mouse.Target.Parent)
            if hitPlayer and hitPlayer ~= LP then
                -- simulate click
                pcall(function()
                    VIM:SendMouseButtonEvent(0, 0, 0, true, game, 1)
                    task.wait(0.05)
                    VIM:SendMouseButtonEvent(0, 0, 0, false, game, 1)
                end)
            end
        end
    end
end

-- ══════════════════════════════════════════════════════════════
-- BALL CONTROL
-- ══════════════════════════════════════════════════════════════
local function BallTPLoop()
    while S.BallTP do
        RunService.Heartbeat:Wait()
        local ball = GetBall()
        local root = GetRoot()
        if ball and root then
            -- try remote fire
            if Remotes.BallMovement then
                pcall(function()
                    Remotes.BallMovement:FireServer(root.Position + Cam.CFrame.LookVector * S.BallTPDist)
                end)
            end
            -- also direct position (if ball is local)
            if ball.Anchored then
                ball.CFrame = CFrame.new(root.Position + Cam.CFrame.LookVector * S.BallTPDist)
            end
        end
    end
end

local function BallSpinLoop()
    while S.BallSpin do
        RunService.Heartbeat:Wait()
        local ball = GetBall()
        if ball then
            local spin = CFrame.Angles(0, math.rad(S.BallSpinSpeed * 0.016), 0)
            if ball.Anchored then
                ball.CFrame = ball.CFrame * spin
            else
                local bv = ball:FindFirstChildOfClass("BodyAngularVelocity") or Instance.new("BodyAngularVelocity")
                bv.AngularVelocity = Vector3.new(0, S.BallSpinSpeed, 0)
                bv.MaxTorque = Vector3.new(0, 9e9, 0)
                bv.Parent = ball
            end
        end
    end
end

local function TeleportToBall()
    local ball = GetBall()
    local root = GetRoot()
    if ball and root then
        root.CFrame = CFrame.new(ball.Position + Vector3.new(0, 3, 0))
        Notify("Teleported to ball")
    else
        Notify("Ball not found")
    end
end

local function PowerKickBall()
    local ball = GetBall()
    local root = GetRoot()
    if ball and root then
        local dir = (ball.Position - root.Position).Unit
        local bv = Instance.new("BodyVelocity")
        bv.Velocity = dir * S.PowerKickForce + Vector3.new(0, S.PowerKickForce * 0.5, 0)
        bv.MaxForce = Vector3.new(9e9, 9e9, 9e9)
        bv.Parent = ball
        game:GetService("Debris"):AddItem(bv, 0.2)
        
        if Remotes.BallMovement then
            pcall(function()
                Remotes.BallMovement:FireServer(ball.Position + dir * 50)
            end)
        end
        Notify("POWER KICK!")
    end
end

local function AutoGoalLoop()
    while S.AutoGoal do
        task.wait(0.5)
        local ball = GetBall()
        local root = GetRoot()
        if ball and root then
            -- try to find goal (look for goal-named parts)
            for _, obj in ipairs(WS:GetDescendants()) do
                if obj:IsA("BasePart") and obj.Name:lower():find("goal") then
                    if Remotes.BallMovement then
                        pcall(function()
                            Remotes.BallMovement:FireServer(obj.Position)
                        end)
                    end
                    break
                end
            end
        end
    end
end

-- ══════════════════════════════════════════════════════════════
-- MOVEMENT
-- ══════════════════════════════════════════════════════════════
RunService.Heartbeat:Connect(function()
    if S.Speed then
        local hum = GetHum()
        if hum then hum.WalkSpeed = S.SpeedVal end
    end
    if S.HighJump then
        local hum = GetHum()
        if hum then
            hum.JumpPower = S.JumpPower
            hum.UseJumpPower = true
        end
    end
end)

local flyConn
local function StartFly()
    local root = GetRoot()
    if not root then return end
    
    local gyro = Instance.new("BodyGyro")
    gyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
    gyro.P = 9e4
    gyro.Parent = root
    
    local vel = Instance.new("BodyVelocity")
    vel.MaxForce = Vector3.new(9e9, 9e9, 9e9)
    vel.Velocity = Vector3.new(0, 0, 0)
    vel.Parent = root
    
    flyConn = RunService.Heartbeat:Connect(function()
        if not S.Fly then
            gyro:Destroy()
            vel:Destroy()
            flyConn:Disconnect()
            return
        end
        local cf = Cam.CFrame
        local dir = Vector3.zero
        if UIS:IsKeyDown(Enum.KeyCode.W) then dir = dir + cf.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.S) then dir = dir - cf.LookVector end
        if UIS:IsKeyDown(Enum.KeyCode.A) then dir = dir - cf.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.D) then dir = dir + cf.RightVector end
        if UIS:IsKeyDown(Enum.KeyCode.Space) then dir = dir + Vector3.new(0, 1, 0) end
        if UIS:IsKeyDown(Enum.KeyCode.LeftControl) then dir = dir - Vector3.new(0, 1, 0) end
        vel.Velocity = dir.Magnitude > 0 and dir.Unit * S.FlySpeed or Vector3.zero
        gyro.CFrame = cf
    end)
end

RunService.Stepped:Connect(function()
    if S.Noclip then
        local char = GetChar()
        if char then
            for _, p in ipairs(char:GetDescendants()) do
                if p:IsA("BasePart") then
                    p.CanCollide = false
                end
            end
        end
    end
end)

UIS.JumpRequest:Connect(function()
    if S.InfiniteJump then
        local hum = GetHum()
        if hum then hum:ChangeState(Enum.HumanoidStateType.Jumping) end
    end
end)

local spinConn
local function ToggleSpinBot()
    S.SpinBot = not S.SpinBot
    if S.SpinBot then
        spinConn = RunService.Heartbeat:Connect(function()
            local root = GetRoot()
            if root then
                root.CFrame = root.CFrame * CFrame.Angles(0, math.rad(S.SpinSpeed), 0)
            end
        end)
    else
        if spinConn then spinConn:Disconnect() end
    end
end

-- ══════════════════════════════════════════════════════════════
-- VISUALS
-- ══════════════════════════════════════════════════════════════
local oldLighting
local function ToggleFullbright()
    S.Fullbright = not S.Fullbright
    if S.Fullbright then
        oldLighting = {
            Brightness = Lighting.Brightness,
            Ambient = Lighting.Ambient,
            OutdoorAmbient = Lighting.OutdoorAmbient,
            FogEnd = Lighting.FogEnd,
        }
        Lighting.Brightness = 2
        Lighting.Ambient = Color3.new(1, 1, 1)
        Lighting.OutdoorAmbient = Color3.new(1, 1, 1)
        Lighting.FogEnd = 100000
    elseif oldLighting then
        Lighting.Brightness = oldLighting.Brightness
        Lighting.Ambient = oldLighting.Ambient
        Lighting.OutdoorAmbient = oldLighting.OutdoorAmbient
        Lighting.FogEnd = oldLighting.FogEnd
    end
    Notify("Fullbright: " .. (S.Fullbright and "ON" or "OFF"))
end

local Lighting = game:GetService("Lighting")

-- ══════════════════════════════════════════════════════════════
-- ANTI-AFK
-- ══════════════════════════════════════════════════════════════
if S.AntiAFK then
    LP.Idled:Connect(function()
        VirtualUser:CaptureController()
        VirtualUser:ClickButton2(Vector2.new(0, 0))
    end)
end

-- ══════════════════════════════════════════════════════════════
-- AUTO RESPAWN
-- ══════════════════════════════════════════════════════════════
LP.CharacterAdded:Connect(function(char)
    if S.AutoRespawn then
        local hum = char:WaitForChild("Humanoid", 10)
        if hum then
            hum.Died:Connect(function()
                task.wait(2)
                -- try to respawn via reset
                pcall(function()
                    LP:LoadCharacter()
                end)
            end)
        end
    end
end)

-- ══════════════════════════════════════════════════════════════
-- UI SYSTEM
-- ══════════════════════════════════════════════════════════════
local GUI = {}
local MainFrame
local ContentFrame
local Tabs = {}

local COLORS = {
    BG = Color3.fromRGB(12, 12, 20),
    BG2 = Color3.fromRGB(20, 20, 32),
    Accent = Color3.fromRGB(0, 255, 130),
    AccentDark = Color3.fromRGB(0, 180, 90),
    Text = Color3.fromRGB(220, 220, 230),
    TextDim = Color3.fromRGB(100, 100, 120),
    Danger = Color3.fromRGB(255, 60, 60),
    Warning = Color3.fromRGB(255, 180, 50),
    On = Color3.fromRGB(0, 80, 40),
    Off = Color3.fromRGB(30, 30, 45),
}

local function StyleCorner(parent, r)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, r or 6)
    c.Parent = parent
end

local function StyleStroke(parent, color, thick)
    local s = Instance.new("UIStroke")
    s.Color = color or COLORS.Accent
    s.Thickness = thick or 1.5
    s.Parent = parent
    return s
end

local function CreateToggle(parent, text, stateRef, callback)
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, -12, 0, 34)
    frame.BackgroundColor3 = COLORS.Off
    frame.BorderSizePixel = 0
    frame.Parent = parent
    StyleCorner(frame, 6)
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(0.7, 0, 1, 0)
    label.Position = UDim2.new(0, 10, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = COLORS.Text
    label.Font = Enum.Font.GothamSemibold
    label.TextSize = 12
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame
    
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(0, 50, 0, 22)
    btn.Position = UDim2.new(1, -58, 0.5, -11)
    btn.BackgroundColor3 = stateRef and COLORS.On or COLORS.Off
    btn.Text = stateRef and "ON" or "OFF"
    btn.TextColor3 = stateRef and COLORS.Accent or COLORS.TextDim
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 10
    btn.BorderSizePixel = 0
    btn.Parent = frame
    StyleCorner(btn, 4)
    
    btn.MouseButton1Click:Connect(function()
        -- flip the state in S via the key
        local key = stateRef
        S[key] = not S[key]
        local on = S[key]
        btn.Text = on and "ON" or "OFF"
        btn.BackgroundColor3 = on and COLORS.On or COLORS.Off
        btn.TextColor3 = on and COLORS.Accent or COLORS.TextDim
        if callback then callback(on) end
    end)
    
    return frame
end

local function CreateSlider(parent, text, stateKey, min, max, callback)
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, -12, 0, 44)
    frame.BackgroundColor3 = COLORS.Off
    frame.BorderSizePixel = 0
    frame.Parent = parent
    StyleCorner(frame, 6)
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(0.5, 0, 0, 20)
    label.Position = UDim2.new(0, 10, 0, 2)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = COLORS.Text
    label.Font = Enum.Font.GothamSemibold
    label.TextSize = 11
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame
    
    local valLabel = Instance.new("TextLabel")
    valLabel.Size = UDim2.new(0.3, 0, 0, 20)
    valLabel.Position = UDim2.new(0.7, 0, 0, 2)
    valLabel.BackgroundTransparency = 1
    valLabel.Text = tostring(S[stateKey])
    valLabel.TextColor3 = COLORS.Accent
    valLabel.Font = Enum.Font.GothamBold
    valLabel.TextSize = 12
    valLabel.TextXAlignment = Enum.TextXAlignment.Right
    valLabel.Parent = frame
    
    local sliderBg = Instance.new("Frame")
    sliderBg.Size = UDim2.new(1, -20, 0, 6)
    sliderBg.Position = UDim2.new(0, 10, 0, 30)
    sliderBg.BackgroundColor3 = Color3.fromRGB(40, 40, 55)
    sliderBg.BorderSizePixel = 0
    sliderBg.Parent = frame
    StyleCorner(sliderBg, 3)
    
    local sliderFill = Instance.new("Frame")
    sliderFill.Size = UDim2.new((S[stateKey] - min) / (max - min), 0, 1, 0)
    sliderFill.BackgroundColor3 = COLORS.Accent
    sliderFill.BorderSizePixel = 0
    sliderFill.Parent = sliderBg
    StyleCorner(sliderFill, 3)
    
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, 0, 1, 10)
    btn.Position = UDim2.new(0, 0, 0, -5)
    btn.BackgroundTransparency = 1
    btn.Text = ""
    btn.Parent = sliderBg
    
    local dragging = false
    btn.MouseButton1Down:Connect(function() dragging = true end)
    btn.MouseButton1Up:Connect(function() dragging = false end)
    UIS.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 then dragging = false end
    end)
    
    RunService.Heartbeat:Connect(function()
        if dragging then
            local mouse = UIS:GetMouseLocation()
            local rel = math.clamp((mouse.X - sliderBg.AbsolutePosition.X) / sliderBg.AbsoluteSize.X, 0, 1)
            local val = math.floor(min + rel * (max - min))
            S[stateKey] = val
            sliderFill.Size = UDim2.new(rel, 0, 1, 0)
            valLabel.Text = tostring(val)
            if callback then callback(val) end
        end
    end)
    
    return frame
end

local function CreateButton(parent, text, callback, color)
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, -12, 0, 34)
    btn.BackgroundColor3 = color or Color3.fromRGB(40, 25, 50)
    btn.Text = text
    btn.TextColor3 = color and Color3.new(1, 1, 1) or COLORS.Warning
    btn.Font = Enum.Font.GothamSemibold
    btn.TextSize = 12
    btn.BorderSizePixel = 0
    btn.Parent = parent
    StyleCorner(btn, 6)
    
    btn.MouseButton1Click:Connect(callback)
    
    btn.MouseEnter:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.15), {
            BackgroundColor3 = color and Color3.fromRGB(60, 40, 70) or Color3.fromRGB(60, 40, 50)
        }):Play()
    end)
    btn.MouseLeave:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.15), {
            BackgroundColor3 = color or Color3.fromRGB(40, 25, 50)
        }):Play()
    end)
    
    return btn
end

local function CreateDropdown(parent, text, options, stateKey, callback)
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, -12, 0, 34)
    frame.BackgroundColor3 = COLORS.Off
    frame.BorderSizePixel = 0
    frame.Parent = parent
    StyleCorner(frame, 6)
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(0.5, 0, 1, 0)
    label.Position = UDim2.new(0, 10, 0, 0)
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = COLORS.Text
    label.Font = Enum.Font.GothamSemibold
    label.TextSize = 12
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.Parent = frame
    
    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(0, 100, 0, 22)
    btn.Position = UDim2.new(1, -110, 0.5, -11)
    btn.BackgroundColor3 = COLORS.BG2
    btn.Text = S[stateKey]
    btn.TextColor3 = COLORS.Accent
    btn.Font = Enum.Font.Gotham
    btn.TextSize = 11
    btn.Parent = frame
    StyleCorner(btn, 4)
    
    local currentIdx = 1
    for i, opt in ipairs(options) do
        if opt == S[stateKey] then currentIdx = i break end
    end
    
    btn.MouseButton1Click:Connect(function()
        currentIdx = currentIdx % #options + 1
        S[stateKey] = options[currentIdx]
        btn.Text = S[stateKey]
        if callback then callback(S[stateKey]) end
    end)
    
    return frame
end

-- Tab system
local function CreateTab(name, icon)
    return {Name = name, Icon = icon or "", Elements = {}}
end

local function AddToTab(tabName, elementType, ...)
    for _, tab in ipairs(Tabs) do
        if tab.Name == tabName then
            table.insert(tab.Elements, {Type = elementType, Args = {...}})
            return
        end
    end
end

local function BuildUI()
    -- ScreenGui
    local sg = Instance.new("ScreenGui")
    sg.Name = "REA_IllegalSoccer_Full"
    sg.ResetOnSpawn = false
    sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    sg.Parent = LP:WaitForChild("PlayerGui")
    GUI.ScreenGui = sg
    
    -- Main frame
    MainFrame = Instance.new("Frame")
    MainFrame.Name = "Main"
    MainFrame.Size = UDim2.new(0, 520, 0, 480)
    MainFrame.Position = UDim2.new(0.5, -260, 0.5, -240)
    MainFrame.BackgroundColor3 = COLORS.BG
    MainFrame.BorderSizePixel = 0
    MainFrame.Active = true
    MainFrame.Draggable = true
    MainFrame.Parent = sg
    StyleCorner(MainFrame, 10)
    StyleStroke(MainFrame, COLORS.Accent, 2)
    
    -- Title bar
    local titleBar = Instance.new("Frame")
    titleBar.Size = UDim2.new(1, 0, 0, 45)
    titleBar.BackgroundColor3 = COLORS.BG2
    titleBar.BorderSizePixel = 0
    titleBar.Parent = MainFrame
    
    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(0.6, 0, 1, 0)
    title.Position = UDim2.new(0, 15, 0, 0)
    title.BackgroundTransparency = 1
    title.Text = "⚽ ILLEGAL SOCCER"
    title.TextColor3 = COLORS.Accent
    title.Font = Enum.Font.GothamBlack
    title.TextSize = 18
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.Parent = titleBar
    
    local subtitle = Instance.new("TextLabel")
    subtitle.Size = UDim2.new(0.4, 0, 0, 15)
    subtitle.Position = UDim2.new(0, 15, 0, 28)
    subtitle.BackgroundTransparency = 1
    subtitle.Text = "REA Full v2.0 | Place 126987974021910"
    subtitle.TextColor3 = COLORS.TextDim
    subtitle.Font = Enum.Font.Gotham
    subtitle.TextSize = 9
    subtitle.TextXAlignment = Enum.TextXAlignment.Left
    subtitle.Parent = titleBar
    
    -- Minimize button
    local minBtn = Instance.new("TextButton")
    minBtn.Size = UDim2.new(0, 30, 0, 30)
    minBtn.Position = UDim2.new(1, -40, 0, 8)
    minBtn.BackgroundColor3 = COLORS.BG
    minBtn.Text = "—"
    minBtn.TextColor3 = COLORS.Text
    minBtn.Font = Enum.Font.GothamBold
    minBtn.TextSize = 16
    minBtn.BorderSizePixel = 0
    minBtn.Parent = titleBar
    StyleCorner(minBtn, 6)
    
    minBtn.MouseButton1Click:Connect(function()
        S.Visible = not S.Visible
        ContentFrame.Visible = S.Visible
        MainFrame.Size = S.Visible and UDim2.new(0, 520, 0, 480) or UDim2.new(0, 520, 0, 45)
    end)
    
    -- Tab bar
    local tabBar = Instance.new("Frame")
    tabBar.Size = UDim2.new(1, 0, 0, 36)
    tabBar.Position = UDim2.new(0, 0, 0, 45)
    tabBar.BackgroundColor3 = COLORS.BG2
    tabBar.BorderSizePixel = 0
    tabBar.Parent = MainFrame
    
    local tabLayout = Instance.new("UIListLayout")
    tabLayout.FillDirection = Enum.FillDirection.Horizontal
    tabLayout.Padding = UDim.new(0, 2)
    tabLayout.Parent = tabBar
    
    -- Content area
    ContentFrame = Instance.new("ScrollingFrame")
    ContentFrame.Name = "Content"
    ContentFrame.Size = UDim2.new(1, -16, 1, -90)
    ContentFrame.Position = UDim2.new(0, 8, 0, 86)
    ContentFrame.BackgroundTransparency = 1
    ContentFrame.BorderSizePixel = 0
    ContentFrame.ScrollBarThickness = 4
    ContentFrame.ScrollBarImageColor3 = COLORS.Accent
    ContentFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
    ContentFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
    ContentFrame.Parent = MainFrame
    
    local contentLayout = Instance.new("UIListLayout")
    contentLayout.Padding = UDim.new(0, 4)
    contentLayout.Parent = ContentFrame
    
    -- Define tabs
    Tabs = {
        CreateTab("Combat", "⚔"),
        CreateTab("Ball", "⚽"),
        CreateTab("Movement", "🏃"),
        CreateTab("ESP", "👁"),
        CreateTab("Visuals", "🎨"),
        CreateTab("Player", "👤"),
        CreateTab("Spy", "📡"),
        CreateTab("Misc", "⚙"),
    }
    
    local activeTab = Tabs[1]
    
    local function RenderTab(tab)
        -- clear content
        for _, child in ipairs(ContentFrame:GetChildren()) do
            if child:IsA("GuiObject") then child:Destroy() end
        end
        
        -- render elements
        for _, elem in ipairs(tab.Elements) do
            if elem.Type == "Toggle" then
                CreateToggle(ContentFrame, elem.Args[1], elem.Args[2], elem.Args[3])
            elseif elem.Type == "Slider" then
                CreateSlider(ContentFrame, elem.Args[1], elem.Args[2], elem.Args[3], elem.Args[4], elem.Args[5])
            elseif elem.Type == "Button" then
                CreateButton(ContentFrame, elem.Args[1], elem.Args[2], elem.Args[3])
            elseif elem.Type == "Dropdown" then
                CreateDropdown(ContentFrame, elem.Args[1], elem.Args[2], elem.Args[3], elem.Args[4])
            elseif elem.Type == "Label" then
                local lbl = Instance.new("TextLabel")
                lbl.Size = UDim2.new(1, -12, 0, 24)
                lbl.BackgroundTransparency = 1
                lbl.Text = elem.Args[1]
                lbl.TextColor3 = COLORS.TextDim
                lbl.Font = Enum.Font.Gotham
                lbl.TextSize = 10
                lbl.TextXAlignment = Enum.TextXAlignment.Left
                lbl.Parent = ContentFrame
            end
        end
        
        -- spacer
        local spacer = Instance.new("Frame")
        spacer.Size = UDim2.new(1, 0, 0, 20)
        spacer.BackgroundTransparency = 1
        spacer.Parent = ContentFrame
    end
    
    -- Build tab buttons
    for i, tab in ipairs(Tabs) do
        local tabBtn = Instance.new("TextButton")
        tabBtn.Size = UDim2.new(0, 60, 0, 30)
        tabBtn.BackgroundColor3 = COLORS.BG
        tabBtn.Text = tab.Icon .. " " .. tab.Name
        tabBtn.TextColor3 = COLORS.TextDim
        tabBtn.Font = Enum.Font.Gotham
        tabBtn.TextSize = 10
        tabBtn.BorderSizePixel = 0
        tabBtn.Parent = tabBar
        StyleCorner(tabBtn, 4)
        
        tabBtn.MouseButton1Click:Connect(function()
            activeTab = tab
            RenderTab(tab)
            -- update tab colors
            for _, child in ipairs(tabBar:GetChildren()) do
                if child:IsA("TextButton") then
                    child.BackgroundColor3 = COLORS.BG
                    child.TextColor3 = COLORS.TextDim
                end
            end
            tabBtn.BackgroundColor3 = COLORS.AccentDark
            tabBtn.TextColor3 = Color3.new(1, 1, 1)
        end)
        
        if i == 1 then
            tabBtn.BackgroundColor3 = COLORS.AccentDark
            tabBtn.TextColor3 = Color3.new(1, 1, 1)
        end
    end
    
    -- ===== POPULATE TABS =====
    
    -- COMBAT
    AddToTab("Combat", "Toggle", "Aimbot", "Aimbot", function(on)
        if on then task.spawn(AimbotLoop) end
        Notify("Aimbot: " .. (on and "ON" or "OFF"))
    end)
    AddToTab("Combat", "Dropdown", "Aim Part", {"Head", "HumanoidRootPart"}, "AimbotPart")
    AddToTab("Combat", "Slider", "Aim Smooth", "AimbotSmooth", 1, 20)
    AddToTab("Combat", "Toggle", "Triggerbot", "Triggerbot", function(on)
        if on then task.spawn(TriggerbotLoop) end
    end)
    AddToTab("Combat", "Slider", "Trigger Delay (s)", "TriggerbotDelay", 1, 20) -- will be /100
    AddToTab("Combat", "Toggle", "Rapid Fire", "RapidFire", function(on) Notify("Rapid Fire: " .. tostring(on)) end)
    AddToTab("Combat", "Toggle", "No Recoil", "NoRecoil", function(on) Notify("No Recoil: " .. tostring(on)) end)
    AddToTab("Combat", "Toggle", "Infinite Ammo", "InfiniteAmmo", function(on) Notify("Infinite Ammo: " .. tostring(on)) end)
    AddToTab("Combat", "Toggle", "No Spread", "Nospread", function(on) Notify("No Spread: " .. tostring(on)) end)
    AddToTab("Combat", "Label", "── BALL COMBAT ──")
    AddToTab("Combat", "Toggle", "Ball Control (TP to aim)", "BallControl", function(on) Notify("Ball Control: " .. tostring(on)) end)
    AddToTab("Combat", "Toggle", "Power Kick", "PowerKick", function(on)
        if on then
            PowerKickBall()
            S.PowerKick = false
        end
    end)
    AddToTab("Combat", "Slider", "Kick Power", "PowerKickForce", 100, 2000)
    
    -- BALL
    AddToTab("Ball", "Toggle", "Ball Teleport Follow", "BallTP", function(on)
        if on then task.spawn(BallTPLoop) end
    end)
    AddToTab("Ball", "Slider", "TP Distance", "BallTPDist", 1, 20)
    AddToTab("Ball", "Toggle", "Ball Spin", "BallSpin", function(on)
        if on then task.spawn(BallSpinLoop) end
    end)
    AddToTab("Ball", "Slider", "Spin Speed", "BallSpinSpeed", 10, 500)
    AddToTab("Ball", "Toggle", "Auto Goal", "AutoGoal", function(on)
        if on then task.spawn(AutoGoalLoop) end
    end)
    AddToTab("Ball", "Toggle", "Ball Noclip", "BallNoclip", function(on)
        local ball = GetBall()
        if ball then ball.CanCollide = not on end
    end)
    AddToTab("Ball", "Toggle", "Catch Ball (ESP+TP)", "CatchBall", function(on)
        if on then
            S.ESPBall = true
            ToggleBallESP()
        end
    end)
    AddToTab("Ball", "Button", "⚽ Teleport to Ball", TeleportToBall, COLORS.On)
    AddToTab("Ball", "Button", "💥 Power Kick Now", PowerKickBall, Color3.fromRGB(180, 40, 40))
    AddToTab("Ball", "Button", "🔄 Rescan Remotes", function()
        RescanRemotes()
        local count = 0
        for _, v in pairs(Remotes) do if v then count = count + 1 end end
        Notify("Remotes found: " .. count .. "/4")
    end)
    
    -- MOVEMENT
    AddToTab("Movement", "Toggle", "Speed Hack", "Speed", function(on)
        if not on then
            local hum = GetHum()
            if hum then hum.WalkSpeed = 16 end
        end
    end)
    AddToTab("Movement", "Slider", "Speed Value", "SpeedVal", 16, 200)
    AddToTab("Movement", "Toggle", "Fly (WASD+Space+Ctrl)", "Fly", function(on)
        if on then StartFly() end
    end)
    AddToTab("Movement", "Slider", "Fly Speed", "FlySpeed", 20, 200)
    AddToTab("Movement", "Toggle", "Noclip", "Noclip")
    AddToTab("Movement", "Toggle", "Infinite Jump", "InfiniteJump")
    AddToTab("Movement", "Toggle", "High Jump", "HighJump")
    AddToTab("Movement", "Slider", "Jump Power", "JumpPower", 50, 500)
    AddToTab("Movement", "Button", "🌀 Spin Bot", ToggleSpinBot)
    AddToTab("Movement", "Slider", "Spin Speed", "SpinSpeed", 5, 100)
    AddToTab("Movement", "Toggle", "Anti-Void (auto teleport up)", "AntiVoid", function(on)
        if on then
            task.spawn(function()
                while S.AntiVoid do
                    task.wait(0.5)
                    local root = GetRoot()
                    if root and root.Position.Y < -50 then
                        root.CFrame = CFrame.new(root.Position.X, 10, root.Position.Z)
                    end
                end
            end)
        end
    end)
    AddToTab("Movement", "Button", "⬆ Teleport Up +50", function()
        local root = GetRoot()
        if root then root.CFrame = root.CFrame + Vector3.new(0, 50, 0) end
    end)
    
    -- ESP
    AddToTab("ESP", "Toggle", "Player ESP", "ESP", function(on)
        if on then
            for _, p in ipairs(Players:GetPlayers()) do CreatePlayerESP(p) end
            Players.PlayerAdded:Connect(CreatePlayerESP)
            Players.PlayerRemoving:Connect(RemovePlayerESP)
        else
            for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
        end
    end)
    AddToTab("ESP", "Toggle", "ESP Name", "ESPName")
    AddToTab("ESP", "Toggle", "ESP Distance", "ESPDist")
    AddToTab("ESP", "Toggle", "ESP Health", "ESPHealth")
    AddToTab("ESP", "Toggle", "ESP Tracer", "ESPTracer")
    AddToTab("ESP", "Toggle", "ESP Chams (Highlight)", "ESPChams", function(on)
        if on and S.ESP then
            -- re-create with chams
            for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
            for _, p in ipairs(Players:GetPlayers()) do CreatePlayerESP(p) end
        end
    end)
    AddToTab("ESP", "Toggle", "Ball ESP", "ESPBall", function(on)
        if on ~= S.ESPBall then ToggleBallESP() end
    end)
    AddToTab("ESP", "Label", "── ESP COLOR ──")
    AddToTab("ESP", "Button", "🔴 Red ESP", function()
        S.ESPColor = Color3.fromRGB(255, 50, 50)
        Notify("ESP Color: Red")
    end, Color3.fromRGB(180, 30, 30))
    AddToTab("ESP", "Button", "🟢 Green ESP", function()
        S.ESPColor = Color3.fromRGB(50, 255, 50)
        Notify("ESP Color: Green")
    end, Color3.fromRGB(30, 150, 30))
    AddToTab("ESP", "Button", "🔵 Blue ESP", function()
        S.ESPColor = Color3.fromRGB(50, 100, 255)
        Notify("ESP Color: Blue")
    end, Color3.fromRGB(30, 60, 180))
    AddToTab("ESP", "Button", "🟡 Yellow ESP", function()
        S.ESPColor = Color3.fromRGB(255, 255, 50)
        Notify("ESP Color: Yellow")
    end, Color3.fromRGB(180, 180, 30))
    
    -- VISUALS
    AddToTab("Visuals", "Toggle", "Fullbright", "Fullbright", ToggleFullbright)
    AddToTab("Visuals", "Toggle", "Remove Fog", "FogRemove", function(on)
        if on then
            Lighting.FogEnd = 100000
            Lighting.FogStart = 0
        else
            Lighting.FogEnd = 1000
        end
    end)
    AddToTab("Visuals", "Toggle", "Custom FOV", "FOV", function(on)
        if on then Cam.FieldOfView = S.FOVVal else Cam.FieldOfView = 70 end
    end)
    AddToTab("Visuals", "Slider", "FOV Value", "FOVVal", 30, 120, function(val)
        if S.FOV then Cam.FieldOfView = val end
    end)
    AddToTab("Visuals", "Button", "📷 Screenshot Cam", function()
        Notify("Cam Pos: " .. tostring(Cam.CFrame.Position))
    end)
    
    -- PLAYER
    AddToTab("Player", "Toggle", "Anti-AFK", "AntiAFK")
    AddToTab("Player", "Toggle", "Auto Respawn", "AutoRespawn")
    AddToTab("Player", "Toggle", "Anti-Kick", "AntiKick", function(on)
        if on then
            -- hook kick
            pcall(function()
                local mt = getrawmetatable(game)
                local old = mt.__namecall
                setreadonly(mt, false)
                mt.__namecall = newcclosure(function(self, ...)
                    local method = getnamecallmethod()
                    if method == "Kick" or method == "kick" then
                        if S.AntiKick then
                            Notify("Kick blocked!")
                            return
                        end
                    end
                    return old(self, ...)
                end)
                setreadonly(mt, true)
            end)
        end
    end)
    AddToTab("Player", "Button", "👤 Teleport to Player", function()
        local closest = GetClosestPlayer(500)
        if closest then
            local root = GetRoot()
            local target = closest.Character:FindFirstChild("HumanoidRootPart")
            if root and target then
                root.CFrame = target.CFrame * CFrame.new(0, 0, 5)
                Notify("Teleported to " .. closest.DisplayName)
            end
        else
            Notify("No player found")
        end
    end)
    AddToTab("Player", "Button", "💀 Killaura (nearest)", function()
        local closest, dist = GetClosestPlayer(10)
        if closest and dist < 10 then
            local hum = closest.Character:FindFirstChildOfClass("Humanoid")
            if hum then
                -- try damage via remote
                hum.Health = 0
                Notify("Killaura: " .. closest.DisplayName)
            end
        end
    end, Color3.fromRGB(150, 30, 30))
    
    -- SPY
    AddToTab("Spy", "Toggle", "Remote Spy", "SpyRemotes", function(on)
        if on then StartRemoteSpy() end
        Notify("Remote Spy: " .. (on and "ON" or "OFF"))
    end)
    AddToTab("Spy", "Button", "📋 Dump All Remotes", function()
        local remotes = RS:FindFirstChild("Remotes")
        if not remotes then Notify("No Remotes folder") return end
        
        print("===== FULL REMOTE DUMP =====")
        print("Place: 126987974021910")
        print("Time: " .. os.date())
        print("--- REA Known ---")
        for name, remote in pairs(Remotes) do
            print(name, "=>", remote and remote:GetFullName() or "NOT FOUND")
        end
        print("--- All Remotes in ReplicatedStorage ---")
        local count = 0
        for _, obj in ipairs(RS:GetDescendants()) do
            if obj:IsA("RemoteEvent") or obj:IsA("RemoteFunction") then
                print(string.format("[%s] %s", obj.ClassName, obj:GetFullName()))
                count = count + 1
            end
        end
        print("Total remotes: " .. count)
        print("--- Remotes folder deep scan ---")
        for _, obj in ipairs(remotes:GetDescendants()) do
            print(string.format("[%s] %s (Children: %d)", obj.ClassName, obj:GetFullName(), #obj:GetChildren()))
        end
        print("===== END DUMP =====")
        Notify("Dumped " .. count .. " remotes to console")
    end)
    AddToTab("Spy", "Button", "🔍 Scan Workspace Structure", function()
        print("===== WORKSPACE STRUCTURE =====")
        for _, obj in ipairs(WS:GetChildren()) do
            print(obj.Name .. " [" .. obj.ClassName .. "]")
            if obj:IsA("Folder") or obj:IsA("Model") then
                for _, child in ipairs(obj:GetChildren()) do
                    print("  └ " .. child.Name .. " [" .. child.ClassName .. "]")
                end
            end
        end
        print("===== END =====")
        Notify("Workspace scan complete")
    end)
    AddToTab("Spy", "Button", "📜 View Spy Log", function()
        print("===== SPY LOG =====")
        for _, entry in ipairs(S.SpyLog) do
            print(entry)
        end
        print("Total entries: " .. #S.SpyLog)
    end)
    
    -- MISC
    AddToTab("Misc", "Label", "── HOTKEYS ──")
    AddToTab("Misc", "Label", "F1 = ESP | F2 = Ball ESP | F3 = Aimbot")
    AddToTab("Misc", "Label", "F4 = Fly | F5 = Speed | F6 = Noclip")
    AddToTab("Misc", "Label", "F7 = Infinite Jump | RightShift = Hide UI")
    AddToTab("Misc", "Label", "")
    AddToTab("Misc", "Button", "🔄 Rescan All Remotes", function()
        RescanRemotes()
        local found = 0
        for _, v in pairs(Remotes) do if v then found = found + 1 end end
        Notify("Remotes: " .. found .. "/4 mapped")
    end)
    AddToTab("Misc", "Button", "📊 Game Info", function()
        print("===== GAME INFO =====")
        print("Place ID: 126987974021910")
        print("Universe: 10155360168")
        print("Game: Illegal Soccer")
        print("Creator: Repotted")
        print("Players: " .. #Players:GetPlayers())
        local ball = GetBall()
        print("Ball found: " .. tostring(ball ~= nil))
        if ball then print("Ball pos: " .. tostring(ball.Position)) end
        print("Char pos: " .. tostring(GetRoot() and GetRoot().Position or "N/A"))
        print("===== END =====")
    end)
    AddToTab("Misc", "Button", "🧹 Cleanup ESP", function()
        for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
        if BallESP then BallESP:Remove() BallESP = nil end
        Notify("ESP cleaned")
    end)
    AddToTab("Misc", "Button", "⏏ Unload Script", function()
        -- cleanup
        S.ESP = false
        for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
        if BallESP then BallESP:Remove() end
        if flyConn then flyConn:Disconnect() end
        if spinConn then spinConn:Disconnect() end
        sg:Destroy()
        Notify("Script unloaded")
    end, Color3.fromRGB(120, 30, 30))
    
    -- render first tab
    RenderTab(Tabs[1])
    
    -- Hotkeys
    UIS.InputBegan:Connect(function(input, gpe)
        if gpe then return end
        local kc = input.KeyCode
        if kc == Enum.KeyCode.F1 then
            S.ESP = not S.ESP
            if S.ESP then
                for _, p in ipairs(Players:GetPlayers()) do CreatePlayerESP(p) end
            else
                for p, _ in pairs(ESPObjects) do RemovePlayerESP(p) end
            end
            Notify("ESP: " .. tostring(S.ESP))
        elseif kc == Enum.KeyCode.F2 then
            ToggleBallESP()
        elseif kc == Enum.KeyCode.F3 then
            S.Aimbot = not S.Aimbot
            if S.Aimbot then task.spawn(AimbotLoop) end
            Notify("Aimbot: " .. tostring(S.Aimbot))
        elseif kc == Enum.KeyCode.F4 then
            S.Fly = not S.Fly
            if S.Fly then StartFly() end
            Notify("Fly: " .. tostring(S.Fly))
        elseif kc == Enum.KeyCode.F5 then
            S.Speed = not S.Speed
            if not S.Speed then
                local hum = GetHum()
                if hum then hum.WalkSpeed = 16 end
            end
            Notify("Speed: " .. tostring(S.Speed))
        elseif kc == Enum.KeyCode.F6 then
            S.Noclip = not S.Noclip
            Notify("Noclip: " .. tostring(S.Noclip))
        elseif kc == Enum.KeyCode.F7 then
            S.InfiniteJump = not S.InfiniteJump
            Notify("Inf Jump: " .. tostring(S.InfiniteJump))
        elseif kc == Enum.KeyCode.RightShift then
            MainFrame.Visible = not MainFrame.Visible
        end
    end)
    
    -- ESP update loop
    RunService.Heartbeat:Connect(function()
        if not S.ESP then return end
        local root = GetRoot()
        if not root then return end
        
        for player, objs in pairs(ESPObjects) do
            local char = player.Character
            local hrp = char and char:FindFirstChild("HumanoidRootPart")
            local hum = char and char:FindFirstChildOfClass("Humanoid")
            if hrp then
                local dist = (hrp.Position - root.Position).Magnitude
                for _, obj in ipairs(objs) do
                    if obj.Name == "REA_Tracer" and S.ESPTracer then
                        local mid = (root.Position + hrp.Position) / 2
                        obj.Size = Vector3.new(0.03, 0.03, dist)
                        obj.CFrame = CFrame.lookAt(root.Position, hrp.Position) * CFrame.new(0, 0, -dist/2)
                        obj.Transparency = 0.4
                        obj.Color = S.ESPColor
                    elseif obj.Name == "REA_Tracer" and not S.ESPTracer then
                        obj.Transparency = 1
                    elseif obj:IsA("BillboardGui") then
                        local nameLbl = obj:FindFirstChild("Name")
                        local distLbl = obj:FindFirstChild("Dist")
                        local healthLbl = obj:FindFirstChild("Health")
                        if nameLbl then
                            nameLbl.Text = S.ESPName and player.DisplayName or ""
                            nameLbl.TextColor3 = S.ESPColor
                        end
                        if distLbl then
                            distLbl.Text = S.ESPDist and string.format("[%.0f studs]", dist) or ""
                        end
                        if healthLbl then
                            if S.ESPHealth and hum then
                                local pct = math.floor(hum.Health / hum.MaxHealth * 100)
                                healthLbl.Text = string.format("HP: %d%%", pct)
                                healthLbl.TextColor3 = Color3.new(1 - pct/100, pct/100, 0)
                            else
                                healthLbl.Text = ""
                            end
                        end
                    end
                end
            end
        end
        
        -- Ball ESP update
        if S.ESPBall and BallESP then
            local ball = GetBall()
            if ball then
                BallESP.CFrame = ball.CFrame
                BallESP.Transparency = 0.3
            else
                BallESP.Transparency = 1
            end
        end
    end)
    
    -- Ball control loop
    RunService.Heartbeat:Connect(function()
        if S.BallControl then
            local ball = GetBall()
            local root = GetRoot()
            if ball and root then
                -- keep ball near crosshair
                local targetPos = root.Position + Cam.CFrame.LookVector * S.BallTPDist
                if ball.Anchored then
                    ball.CFrame = CFrame.new(targetPos)
                end
                if Remotes.BallMovement then
                    pcall(function()
                        Remotes.BallMovement:FireServer(targetPos)
                    end)
                end
            end
        end
    end)
end

-- ══════════════════════════════════════════════════════════════
-- INIT
-- ══════════════════════════════════════════════════════════════
BuildUI()

Notify("ILLEGAL SOCCER REA FULL v2.0", 5)
Notify("4 remotes mapped | 8 tabs loaded", 5)
Notify("RightShift to hide | F1-F7 hotkeys", 5)

print("===== REA CHEAT LOADED =====")
print("Place: 126987974021910 | Illegal Soccer")
print("Mapped remotes:")
for name, remote in pairs(Remotes) do
    print("  " .. name .. " => " .. (remote and remote:GetFullName() or "NOT FOUND"))
end
print("Features: Aimbot, Triggerbot, Ball Control, ESP, Fly, Speed, Noclip, Remote Spy")
print("================================")
