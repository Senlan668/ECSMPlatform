package cn.hollis.llm.mentor.agent.service.impl;

import cn.hollis.llm.mentor.agent.entity.AiSession;
import cn.hollis.llm.mentor.agent.entity.vo.SaveQuestionRequest;
import cn.hollis.llm.mentor.agent.entity.vo.UpdateAnswerRequest;
import cn.hollis.llm.mentor.agent.mapper.AiSessionMapper;
import cn.hollis.llm.mentor.agent.service.AiSessionService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * AI会话服务实现类
 */
@Service
@Slf4j
public class AiSessionServiceImpl extends ServiceImpl<AiSessionMapper, AiSession> implements AiSessionService {
    private final Map<Long, AiSession> memorySessions = new ConcurrentHashMap<>();
    private final AtomicLong memoryId = new AtomicLong(-1);
    private final AtomicBoolean persistenceWarningLogged = new AtomicBoolean();

    @Override
    public List<AiSession> findRecentBySessionId(String sessionId, int maxRecords) {
        LambdaQueryWrapper<AiSession> queryWrapper = new LambdaQueryWrapper<AiSession>()
                .eq(AiSession::getSessionId, sessionId)
                .orderByDesc(AiSession::getCreateTime)
                .last("LIMIT " + maxRecords);

        try {
            return this.list(queryWrapper);
        } catch (RuntimeException exception) {
            logPersistenceFallback(exception);
            return memorySessions.values().stream()
                    .filter(session -> sessionId.equals(session.getSessionId()))
                    .sorted(Comparator.comparing(AiSession::getCreateTime).reversed())
                    .limit(maxRecords)
                    .toList();
        }
    }

    @Override
    public AiSession saveQuestion(SaveQuestionRequest request) {
        AiSession aiSession = new AiSession();
        aiSession.setSessionId(request.getSessionId());
        aiSession.setQuestion(request.getQuestion());
        aiSession.setFileid(request.getFileid());
        aiSession.setTools(request.getTools());
        aiSession.setFirstResponseTime(request.getFirstResponseTime());
        aiSession.setCreateTime(LocalDateTime.now());
        aiSession.setUpdateTime(LocalDateTime.now());

        try {
            if (!this.save(aiSession)) {
                aiSession.setId(memoryId.getAndDecrement());
            }
        } catch (RuntimeException exception) {
            logPersistenceFallback(exception);
            aiSession.setId(memoryId.getAndDecrement());
        }
        memorySessions.put(aiSession.getId(), aiSession);
        return aiSession;
    }

    @Override
    public boolean updateAnswer(UpdateAnswerRequest request) {
        AiSession session = memorySessions.get(request.getId());
        if (session == null) {
            try {
                session = this.getById(request.getId());
            } catch (RuntimeException exception) {
                logPersistenceFallback(exception);
            }
        }
        if (session != null) {
            session.setAnswer(request.getAnswer());
            session.setUpdateTime(LocalDateTime.now());
            if (request.getThinking() != null) {
                session.setThinking(request.getThinking());
            }
            if (request.getTools() != null) {
                session.setTools(request.getTools());
            }
            if (request.getReference() != null) {
                session.setReference(request.getReference());
            }
            if (request.getFirstResponseTime() != null) {
                session.setFirstResponseTime(request.getFirstResponseTime());
            }
            if (request.getTotalResponseTime() != null) {
                session.setTotalResponseTime(request.getTotalResponseTime());
            }
            if(request.getRecommend() != null){
                session.setRecommend(request.getRecommend());
            }
            memorySessions.put(session.getId(), session);
            if (session.getId() < 0) return true;
            try {
                return this.updateById(session);
            } catch (RuntimeException exception) {
                logPersistenceFallback(exception);
                return true;
            }
        }
        return false;
    }

    private void logPersistenceFallback(RuntimeException exception) {
        if (persistenceWarningLogged.compareAndSet(false, true)) {
            log.warn("MySQL 会话存储不可用，当前进程将使用内存会话: {}", exception.getMessage());
        }
    }

}
